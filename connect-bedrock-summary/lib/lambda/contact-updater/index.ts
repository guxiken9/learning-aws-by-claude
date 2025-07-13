import { S3Event, Context } from 'aws-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { ConnectClient, UpdateContactAttributesCommand } from '@aws-sdk/client-connect';

const s3Client = new S3Client({});
const connectClient = new ConnectClient({});

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

interface ContactAttributes {
  CallSummary: string;
  SummaryCreatedAt: string;
  SummaryS3Key: string;
  KeyPoints?: string;
  CustomerSentiment?: string;
  ActionRequired?: string;
  CallDuration?: string;
  ProcessingTime?: string;
}

export const handler = async (event: S3Event, context: Context): Promise<void> => {
  console.log('Event:', JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    try {
      const bucket = record.s3.bucket.name;
      const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

      console.log(`Processing summary: ${bucket}/${key}`);

      // S3から要約データを取得
      const getCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const response = await s3Client.send(getCommand);
      const summaryText = await response.Body?.transformToString();

      if (!summaryText) {
        throw new Error('Summary data is empty');
      }

      const summaryData: SummaryData = JSON.parse(summaryText);

      // Connect インスタンスIDの確認
      const instanceId = process.env.CONNECT_INSTANCE_ID;
      if (!instanceId) {
        throw new Error('CONNECT_INSTANCE_ID environment variable is not set');
      }

      console.log(`Updating contact attributes for: ${summaryData.contactId}`);

      // Contact属性を準備
      const attributes: ContactAttributes = {
        CallSummary: truncateText(summaryData.summary, 32000), // Connect属性の最大サイズ制限
        SummaryCreatedAt: summaryData.createdAt,
        SummaryS3Key: key,
        CallDuration: formatDuration(summaryData.metadata.duration),
        ProcessingTime: `${summaryData.metadata.processingTime}ms`,
      };

      // キーポイントがある場合は追加
      if (summaryData.keyPoints && summaryData.keyPoints.length > 0) {
        attributes.KeyPoints = JSON.stringify(summaryData.keyPoints);
      }

      // 感情情報がある場合は追加
      if (summaryData.sentiment) {
        attributes.CustomerSentiment = `${summaryData.sentiment.overall} (${(summaryData.sentiment.score * 100).toFixed(1)}%)`;
      }

      // アクションアイテムがある場合はフラグを設定
      if (summaryData.actionItems && summaryData.actionItems.length > 0) {
        attributes.ActionRequired = "true";
      }

      // Connect Contact属性を更新
      const updateCommand = new UpdateContactAttributesCommand({
        InstanceId: instanceId,
        InitialContactId: summaryData.contactId,
        Attributes: attributes,
      });

      await connectClient.send(updateCommand);

      console.log(`Contact attributes updated successfully for: ${summaryData.contactId}`);
      console.log('Updated attributes:', JSON.stringify(attributes, null, 2));

    } catch (error) {
      console.error('Error updating contact attributes:', error);
      
      // エラー詳細をログに記録
      if (error instanceof Error) {
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }

      // 特定のエラータイプに対する処理
      if (error instanceof Error) {
        if (error.name === 'ResourceNotFoundException') {
          console.error('Contact or instance not found. Check CONNECT_INSTANCE_ID and contact ID.');
        } else if (error.name === 'AccessDeniedException') {
          console.error('Access denied. Check IAM permissions for Connect API.');
        } else if (error.name === 'InvalidParameterException') {
          console.error('Invalid parameter. Check contact ID format and attribute values.');
        }
      }
      
      // CloudWatchメトリクスにエラーを記録
      throw error;
    }
  }
};

/**
 * テキストを指定された最大長に切り詰める
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  
  // 文字境界で切り詰める
  const truncated = text.substring(0, maxLength - 3);
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastSpace > maxLength * 0.8) {
    return truncated.substring(0, lastSpace) + '...';
  }
  
  return truncated + '...';
}

/**
 * 秒数を読みやすい形式にフォーマット
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}時間${minutes}分${remainingSeconds}秒`;
  } else if (minutes > 0) {
    return `${minutes}分${remainingSeconds}秒`;
  } else {
    return `${remainingSeconds}秒`;
  }
}

/**
 * Lambda関数の実行状況をログに記録
 */
function logExecutionStats(context: Context): void {
  const remainingTime = context.getRemainingTimeInMillis();
  const memoryLimit = context.memoryLimitInMB;
  
  console.log(`Execution stats - Memory limit: ${memoryLimit}MB, Remaining time: ${remainingTime}ms`);
}