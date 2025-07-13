# API仕様書

## 1. S3イベント

### 1.1 文字起こしデータ作成イベント
**イベントタイプ**: `s3:ObjectCreated:*`  
**バケット**: `connect-transcriptions-{account}-{region}`  
**プレフィックス**: `transcriptions/`  
**サフィックス**: `.json`

#### イベント構造
```typescript
interface S3Event {
  Records: Array<{
    eventVersion: string;
    eventSource: string;
    awsRegion: string;
    eventTime: string;
    eventName: string;
    s3: {
      bucket: {
        name: string;
        arn: string;
      };
      object: {
        key: string;
        size: number;
        eTag: string;
      };
    };
  }>;
}
```

### 1.2 要約データ作成イベント
**イベントタイプ**: `s3:ObjectCreated:*`  
**バケット**: `connect-summaries-{account}-{region}`  
**プレフィックス**: `summaries/`  
**サフィックス**: `.json`

## 2. データスキーマ

### 2.1 文字起こしデータ
```typescript
interface TranscriptionData {
  contactId: string;                    // Connect ContactのID
  segments: TranscriptionSegment[];     // 会話セグメントの配列
  metadata: {
    startTime: string;                  // ISO 8601形式
    endTime: string;                    // ISO 8601形式
    duration: number;                   // 秒単位
    language?: string;                  // 言語コード (例: "ja-JP")
    phoneNumber?: string;               // 発信者番号（マスク済み）
    queueName?: string;                 // キュー名
    agentId?: string;                   // エージェントID
  };
}

interface TranscriptionSegment {
  speaker: "Agent" | "Customer";        // 話者
  content: string;                      // 発話内容
  timestamp: string;                    // ISO 8601形式
  confidence?: number;                  // 信頼度スコア (0-1)
  sentiment?: "POSITIVE" | "NEUTRAL" | "NEGATIVE"; // 感情分析結果
}
```

### 2.2 要約データ
```typescript
interface SummaryData {
  contactId: string;                    // Connect ContactのID
  summary: string;                      // 要約テキスト
  originalTranscriptionKey: string;     // 元の文字起こしデータのS3キー
  createdAt: string;                    // ISO 8601形式
  metadata: {
    startTime: string;                  // ISO 8601形式
    endTime: string;                    // ISO 8601形式
    duration: number;                   // 秒単位
    language?: string;                  // 言語コード
    modelId: string;                    // 使用したBedrockモデルID
    processingTime: number;             // 処理時間（ミリ秒）
  };
  keyPoints?: string[];                 // 重要ポイントのリスト
  actionItems?: string[];               // アクションアイテムのリスト
  sentiment?: {                         // 全体的な感情分析
    overall: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
    score: number;                      // 信頼度スコア
  };
}
```

## 3. Bedrock API

### 3.1 モデル呼び出し
**エンドポイント**: `bedrock-runtime.{region}.amazonaws.com`  
**モデルID**: `anthropic.claude-3-sonnet-20240229-v1:0`

#### リクエスト
```typescript
interface BedrockRequest {
  modelId: string;
  body: {
    anthropic_version: string;          // "bedrock-2023-05-31"
    max_tokens: number;                 // 最大トークン数
    messages: Array<{
      role: "user" | "assistant";
      content: string;
    }>;
    temperature?: number;               // 0-1 (デフォルト: 0.3)
    top_p?: number;                     // 0-1
    top_k?: number;                     // 整数
    stop_sequences?: string[];          // 停止シーケンス
  };
  contentType: string;                  // "application/json"
}
```

#### レスポンス
```typescript
interface BedrockResponse {
  id: string;                           // レスポンスID
  type: string;                         // "message"
  role: string;                         // "assistant"
  content: Array<{
    type: string;                       // "text"
    text: string;                       // 生成されたテキスト
  }>;
  model: string;                        // モデルID
  stop_reason: string;                  // "end_turn" | "max_tokens" | "stop_sequence"
  stop_sequence: string | null;         // 使用された停止シーケンス
  usage: {
    input_tokens: number;               // 入力トークン数
    output_tokens: number;              // 出力トークン数
  };
}
```

### 3.2 プロンプトテンプレート
```typescript
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
```

## 4. Amazon Connect API

### 4.1 Contact属性更新
**エンドポイント**: `connect.{region}.amazonaws.com`  
**API**: `UpdateContactAttributes`

#### リクエスト
```typescript
interface UpdateContactAttributesRequest {
  InstanceId: string;                   // ConnectインスタンスID
  InitialContactId: string;             // ContactID
  Attributes: {
    [key: string]: string;              // 属性のキーバリューペア
  };
}
```

#### レスポンス
```typescript
interface UpdateContactAttributesResponse {
  // 成功時は空のレスポンス
}
```

### 4.2 設定可能な属性
```typescript
interface ContactAttributes {
  CallSummary: string;                  // 要約テキスト（最大32KB）
  SummaryCreatedAt: string;             // 要約作成日時
  SummaryS3Key: string;                 // 要約データのS3キー
  KeyPoints?: string;                   // 重要ポイント（JSON文字列）
  CustomerSentiment?: string;           // 顧客感情
  ActionRequired?: string;              // アクション要否（"true"/"false"）
}
```

## 5. エラーコード

### 5.1 Lambda関数エラー
| エラーコード | 説明 | 対処法 |
|------------|------|--------|
| `S3_ACCESS_ERROR` | S3アクセスエラー | バケットポリシーとIAMロールを確認 |
| `PARSE_ERROR` | JSONパースエラー | データフォーマットを確認 |
| `BEDROCK_API_ERROR` | Bedrock APIエラー | APIキーとリージョンを確認 |
| `CONNECT_API_ERROR` | Connect APIエラー | インスタンスIDと権限を確認 |
| `TIMEOUT_ERROR` | タイムアウト | Lambda関数のタイムアウト設定を増やす |

### 5.2 Bedrock APIエラー
| エラーコード | 説明 | 対処法 |
|------------|------|--------|
| `ThrottlingException` | レート制限 | リトライまたはレート調整 |
| `ModelNotReadyException` | モデル未準備 | 少し待ってリトライ |
| `ValidationException` | 入力検証エラー | プロンプトとパラメータを確認 |
| `AccessDeniedException` | アクセス拒否 | IAMロールの権限を確認 |

## 6. 制限事項

### 6.1 サイズ制限
- 文字起こしデータ: 最大5MB/ファイル
- 要約テキスト: 最大32KB
- Bedrockプロンプト: 最大100,000トークン
- Connect属性値: 最大32KB/属性

### 6.2 レート制限
- Bedrock API: 10リクエスト/秒
- Connect API: 2リクエスト/秒
- S3: 3,500 PUT/秒、5,500 GET/秒

### 6.3 タイムアウト
- Lambda関数: 最大15分
- Bedrock API: 最大5分/リクエスト
- Connect API: 最大60秒/リクエスト