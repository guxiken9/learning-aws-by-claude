# Amazon Connect + Bedrock 要約システム

Amazon Connectの通話内容を自動的に文字起こしし、Amazon Bedrock（Claude）を使用して要約を生成するシステムです。

## アーキテクチャ

```
Amazon Connect → Contact Lens → S3 → Lambda → Bedrock → S3 → Connect Contact Attributes
```

## 主な機能

- Amazon Connect Contact Lensによる通話の自動文字起こし
- Amazon Bedrock（Claude 3 Sonnet）による要約生成
- Connect Contact属性への要約結果の自動保存
- CloudWatchアラームによるエラー監視
- S3ライフサイクルポリシーによるデータ管理

## 前提条件

- Node.js 18.x以上
- AWS CLI v2
- AWS CDK v2
- TypeScript
- 適切なAWS権限を持つアカウント
- Amazon Connectインスタンス
- Amazon Bedrockのモデルアクセス権限

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

```bash
cp .env.example .env
# .envファイルを編集して適切な値を設定
```

### 3. CDKブートストラップ（初回のみ）

```bash
npx cdk bootstrap
```

### 4. デプロイ

```bash
# 環境変数を設定
export CONNECT_INSTANCE_ID="your-connect-instance-id"

# デプロイ実行
npx cdk deploy
```

## プロジェクト構造

```
├── bin/
│   └── connect-bedrock-summary.ts      # CDKアプリエントリーポイント
├── lib/
│   ├── connect-bedrock-summary-stack.ts # CDKスタック定義
│   └── lambda/
│       ├── summarizer/                  # 要約処理Lambda
│       │   └── index.ts
│       └── contact-updater/             # Contact属性更新Lambda
│           └── index.ts
├── docs/                               # 設計ドキュメント
├── test/                               # テストコード
├── .env.example                        # 環境変数テンプレート
├── cdk.json                           # CDK設定
├── tsconfig.json                      # TypeScript設定
└── package.json                       # 依存関係
```

## 使用方法

### Amazon Connectの設定

1. Amazon Connectコンソールでインスタンスを選択
2. 「データストレージ」→「記録とアナリティクス」を設定
3. Contact Lensを有効化
4. S3バケットにデプロイ後に出力される`TranscriptionBucketName`を設定

### テスト実行

テスト用の文字起こしファイルをS3にアップロードしてテスト：

```bash
# テストファイルの作成
cat > test-transcription.json << EOF
{
  "contactId": "test-contact-123",
  "segments": [
    {
      "speaker": "Agent",
      "content": "お電話ありがとうございます。どのようなご用件でしょうか？",
      "timestamp": "2024-01-01T10:00:00Z"
    },
    {
      "speaker": "Customer", 
      "content": "注文した商品がまだ届いていないのですが、確認していただけますか？",
      "timestamp": "2024-01-01T10:00:05Z"
    }
  ],
  "metadata": {
    "startTime": "2024-01-01T10:00:00Z",
    "endTime": "2024-01-01T10:05:00Z",
    "duration": 300
  }
}
EOF

# S3にアップロード
aws s3 cp test-transcription.json s3://connect-transcriptions-<account>-<region>/transcriptions/test-contact-123.json
```

### ログの確認

```bash
# Summarizerログの確認
aws logs tail /aws/lambda/ConnectBedrockSummaryStack-SummarizerFunction --follow

# ContactUpdaterログの確認
aws logs tail /aws/lambda/ConnectBedrockSummaryStack-ContactUpdaterFunction --follow
```

## 利用可能なコマンド

- `npm run build` - TypeScriptをJavaScriptにコンパイル
- `npm run watch` - ファイル変更を監視してコンパイル
- `npm run test` - Jestテストの実行
- `npx cdk deploy` - AWSアカウントにスタックをデプロイ
- `npx cdk diff` - デプロイ済みスタックとの差分を表示
- `npx cdk synth` - CloudFormationテンプレートを生成
- `npx cdk destroy` - スタックを削除

## モニタリング

### CloudWatchアラーム

- Lambda関数のエラー率
- 実行時間
- メモリ使用量

### 主要メトリクス

- 処理された通話数
- 要約生成の成功率
- 平均処理時間
- Bedrockトークン使用量

## トラブルシューティング

### よくある問題

1. **Lambda関数がタイムアウトする**
   - メモリサイズを増やす
   - タイムアウト時間を延長

2. **Bedrock APIアクセスエラー**
   - リージョンがBedrockをサポートしているか確認
   - モデルアクセス権限を確認

3. **S3イベントが発火しない**
   - バケットポリシーを確認
   - イベント通知の設定を確認

### デバッグ

```bash
# Lambda関数の詳細ログ
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/ConnectBedrockSummaryStack"

# X-Rayトレースの確認
aws xray get-traces --time-range-type TimeRangeByStartTime --start-time <start> --end-time <end>
```

## セキュリティ

- S3バケットは暗号化およびバージョニングが有効
- Lambda関数は最小権限の原則に基づく権限設定
- 機密情報は環境変数で管理
- CloudTrailによるAPI呼び出しの監査

## コスト最適化

- S3ライフサイクルポリシーによる古いデータの自動削除
- Lambda関数の実行時間最適化
- Bedrockトークン使用量の監視

## クリーンアップ

```bash
# スタックの削除
npx cdk destroy

# S3バケットの手動削除（RemovalPolicy.RETAINのため）
aws s3 rb s3://connect-transcriptions-<account>-<region> --force
aws s3 rb s3://connect-summaries-<account>-<region> --force
```

## ライセンス

MIT License

## サポート

問題や質問がある場合は、GitHubのIssuesページで報告してください。
