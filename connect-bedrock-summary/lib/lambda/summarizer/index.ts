import { S3Event, Context } from 'aws-lambda';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const s3Client = new S3Client({});
const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION });

interface TranscriptionSegment {
  speaker: "Agent" | "Customer";
  content: string;
  timestamp: string;
  confidence?: number;
  sentiment?: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
}

interface TranscriptionData {
  contactId: string;
  segments: TranscriptionSegment[];
  metadata: {
    startTime: string;
    endTime: string;
    duration: number;
    language?: string;
    phoneNumber?: string;
    queueName?: string;
    agentId?: string;
  };
}

interface SummaryData {
  contactId: string;
  summary: string;
  originalTranscriptionKey: string;
  createdAt: string;
  metadata: {
    startTime: string;
    endTime: string;
    duration: number;
    language?: string;
    modelId: string;
    processingTime: number;
  };
  keyPoints?: string[];
  actionItems?: string[];
  sentiment?: {
    overall: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
    score: number;
  };
}

const SUMMARY_PROMPT_TEMPLATE = `
以下の通話内容を日本語で要約してください。要約には以下の情報を含めてください：

1. 通話の主な目的
2. 重要なポイント（3-5個）
3. 解決された問題または未解決の問題
4. 次のアクションアイテム（もしあれば）
5. 全体的な顧客の感情（ポジティブ/ニュートラル/ネガティブ）

出力形式:
【通話の目的】
（ここに記載）

【重要なポイント】
• ポイント1
• ポイント2
• ポイント3

【問題の状況】
（解決済み/未解決の問題を記載）

【アクションアイテム】
• アクション1
• アクション2

【顧客感情】
（感情とその理由）

通話内容：
{conversation}

要約：`;

export const handler = async (event: S3Event, context: Context): Promise<void> => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  const startTime = Date.now();

  for (const record of event.Records) {
    try {
      const bucket = record.s3.bucket.name;
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

      console.log(`Processing transcription: ${bucket}/${key}`);

      // S3から文字起こしデータを取得
      const getCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const response = await s3Client.send(getCommand);
      const transcriptionText = await response.Body?.transformToString();

      if (!transcriptionText) {
        throw new Error('Transcription data is empty');
      }

      const transcriptionData: TranscriptionData = JSON.parse(transcriptionText);

      // 会話内容を整形
      const conversation = transcriptionData.segments
        .map(seg => `${seg.speaker}: ${seg.content}`)
        .join('\n');

      // プロンプトを作成
      const prompt = SUMMARY_PROMPT_TEMPLATE.replace('{conversation}', conversation);

      console.log(`Calling Bedrock API for contact: ${transcriptionData.contactId}`);

      // Bedrockで要約を生成
      const invokeCommand = new InvokeModelCommand({
        modelId: process.env.BEDROCK_MODEL_ID,
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 1000,
          messages: [
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.3,
        }),
        contentType: 'application/json',
      });

      const bedrockResponse = await bedrockClient.send(invokeCommand);
      const responseBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
      const summary = responseBody.content[0].text;

      // 感情分析の抽出
      const sentiment = extractSentiment(transcriptionData.segments);
      
      // キーポイントとアクションアイテムの抽出
      const { keyPoints, actionItems } = extractKeyPointsAndActions(summary);

      const processingTime = Date.now() - startTime;

      // 要約結果を保存
      const summaryData: SummaryData = {
        contactId: transcriptionData.contactId,
        summary: summary,
        originalTranscriptionKey: key,
        createdAt: new Date().toISOString(),
        metadata: {
          ...transcriptionData.metadata,
          modelId: process.env.BEDROCK_MODEL_ID!,
          processingTime: processingTime,
        },
        keyPoints,
        actionItems,
        sentiment,
      };

      const putCommand = new PutObjectCommand({
        Bucket: process.env.SUMMARY_BUCKET!,
        Key: `summaries/${transcriptionData.contactId}-summary.json`,
        Body: JSON.stringify(summaryData, null, 2),
        ContentType: 'application/json',
      });

      await s3Client.send(putCommand);

      console.log(`Summary created for contact: ${transcriptionData.contactId}, processing time: ${processingTime}ms`);

    } catch (error) {
      console.error('Error processing transcription:', error);
      
      // エラー詳細をログに記録
      if (error instanceof Error) {
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      
      // CloudWatchメトリクスにエラーを記録
      throw error;
    }
  }
};

function extractSentiment(segments: TranscriptionSegment[]): { overall: "POSITIVE" | "NEUTRAL" | "NEGATIVE"; score: number } {
  const sentiments = segments
    .map(seg => seg.sentiment)
    .filter(sentiment => sentiment !== undefined);

  if (sentiments.length === 0) {
    return { overall: "NEUTRAL", score: 0.5 };
  }

  const positiveCount = sentiments.filter(s => s === "POSITIVE").length;
  const negativeCount = sentiments.filter(s => s === "NEGATIVE").length;
  const neutralCount = sentiments.filter(s => s === "NEUTRAL").length;

  const total = sentiments.length;
  const positiveRatio = positiveCount / total;
  const negativeRatio = negativeCount / total;

  let overall: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  let score: number;

  if (positiveRatio > 0.6) {
    overall = "POSITIVE";
    score = positiveRatio;
  } else if (negativeRatio > 0.4) {
    overall = "NEGATIVE";
    score = 1 - negativeRatio;
  } else {
    overall = "NEUTRAL";
    score = 0.5;
  }

  return { overall, score };
}

function extractKeyPointsAndActions(summary: string): { keyPoints?: string[]; actionItems?: string[] } {
  const keyPoints: string[] = [];
  const actionItems: string[] = [];

  // 重要なポイントの抽出
  const keyPointsMatch = summary.match(/【重要なポイント】([\s\S]*?)(?=【|$)/);
  if (keyPointsMatch) {
    const points = keyPointsMatch[1]
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('•') || line.startsWith('-'))
      .map(line => line.replace(/^[•-]\s*/, ''));
    keyPoints.push(...points);
  }

  // アクションアイテムの抽出
  const actionItemsMatch = summary.match(/【アクションアイテム】([\s\S]*?)(?=【|$)/);
  if (actionItemsMatch) {
    const actions = actionItemsMatch[1]
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('•') || line.startsWith('-'))
      .map(line => line.replace(/^[•-]\s*/, ''));
    actionItems.push(...actions);
  }

  return {
    keyPoints: keyPoints.length > 0 ? keyPoints : undefined,
    actionItems: actionItems.length > 0 ? actionItems : undefined,
  };
}