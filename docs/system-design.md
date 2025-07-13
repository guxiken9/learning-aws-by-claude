# Amazon Connect + Bedrock 要約システム設計書

## 1. システム概要

### 1.1 目的
Amazon Connectの通話内容を自動的に文字起こしし、Amazon Bedrock（Claude）を使用して要約を生成するシステムを構築します。

### 1.2 主な機能
- 通話内容の自動文字起こし（Contact Lens使用）
- AI による通話内容の要約生成
- 要約結果のConnect Contact属性への自動保存
- 長期保存とライフサイクル管理

## 2. アーキテクチャ

### 2.1 システム構成図
```
┌─────────────────┐
│ Amazon Connect  │
│  + Contact Lens │
└────────┬────────┘
         │ 文字起こしデータ
         ▼
┌─────────────────┐
│ S3 Bucket       │
│ (Transcriptions)│
└────────┬────────┘
         │ S3イベント通知
         ▼
┌─────────────────┐
│ Lambda Function │
│ (Summarizer)    │
└────────┬────────┘
         │ Bedrock API呼び出し
         ▼
┌─────────────────┐
│ Amazon Bedrock  │
│ (Claude Sonnet) │
└────────┬────────┘
         │ 要約結果
         ▼
┌─────────────────┐
│ S3 Bucket       │
│ (Summaries)     │
└────────┬────────┘
         │ S3イベント通知
         ▼
┌─────────────────┐
│ Lambda Function │
│ (ContactUpdater)│
└────────┬────────┘
         │ 属性更新
         ▼
┌─────────────────┐
│ Amazon Connect  │
│ Contact Attrs   │
└─────────────────┘
```

### 2.2 データフロー
1. エージェントと顧客の通話がAmazon Connectで処理される
2. Contact Lensが通話内容をリアルタイムで文字起こし
3. 文字起こしデータがS3バケット（Transcriptions）に保存
4. S3イベント通知でLambda関数（Summarizer）が起動
5. Lambda関数がBedrock APIを呼び出して要約を生成
6. 要約結果がS3バケット（Summaries）に保存
7. S3イベント通知でLambda関数（ContactUpdater）が起動
8. Connect Contact属性に要約が保存される

## 3. コンポーネント詳細

### 3.1 S3バケット

#### Transcriptionsバケット
- **用途**: Contact Lensからの文字起こしデータ保存
- **暗号化**: S3管理の暗号化（SSE-S3）
- **バージョニング**: 有効
- **ライフサイクル**: 90日後に削除
- **アクセス**: Lambda関数からの読み取りのみ

#### Summariesバケット
- **用途**: 生成された要約の保存
- **暗号化**: S3管理の暗号化（SSE-S3）
- **バージョニング**: 有効
- **ライフサイクル**: 365日後に削除
- **アクセス**: Lambda関数からの書き込み/読み取り

### 3.2 Lambda関数

#### Summarizer関数
- **ランタイム**: Node.js 18.x
- **メモリ**: 1024 MB
- **タイムアウト**: 5分
- **主な処理**:
  1. S3から文字起こしデータを取得
  2. データを整形してプロンプトを作成
  3. Bedrock APIを呼び出して要約を生成
  4. 要約結果をS3に保存

#### ContactUpdater関数
- **ランタイム**: Node.js 18.x
- **メモリ**: 512 MB
- **タイムアウト**: 2分
- **主な処理**:
  1. S3から要約データを取得
  2. Connect APIを使用してContact属性を更新

### 3.3 IAMロールと権限

#### Lambda実行ロール
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::connect-transcriptions-*/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::connect-summaries-*/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": "arn:aws:bedrock:*::foundation-model/anthropic.claude-3-sonnet*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "connect:UpdateContactAttributes",
        "connect:DescribeContact"
      ],
      "Resource": "*"
    }
  ]
}
```

## 4. データフォーマット

### 4.1 文字起こしデータ（入力）
```json
{
  "contactId": "12345678-1234-1234-1234-123456789012",
  "segments": [
    {
      "speaker": "Agent",
      "content": "お電話ありがとうございます。",
      "timestamp": "2024-01-01T10:00:00Z"
    }
  ],
  "metadata": {
    "startTime": "2024-01-01T10:00:00Z",
    "endTime": "2024-01-01T10:05:00Z",
    "duration": 300
  }
}
```

### 4.2 要約データ（出力）
```json
{
  "contactId": "12345678-1234-1234-1234-123456789012",
  "summary": "顧客からの配送状況の問い合わせ。注文番号12345の商品が未着。配送業者に確認し、明日配達予定であることを案内。",
  "originalTranscriptionKey": "transcriptions/12345678.json",
  "createdAt": "2024-01-01T10:06:00Z",
  "metadata": {
    "startTime": "2024-01-01T10:00:00Z",
    "endTime": "2024-01-01T10:05:00Z",
    "duration": 300
  }
}
```

## 5. セキュリティ考慮事項

### 5.1 データ保護
- すべてのデータは暗号化して保存
- S3バケットはパブリックアクセスを完全にブロック
- バージョニングによるデータ保護

### 5.2 アクセス制御
- Lambda関数は最小権限の原則に基づいた権限のみ保有
- S3バケットへのアクセスは特定のプレフィックスに限定
- Connect APIへのアクセスは必要最小限の操作のみ

### 5.3 監査とログ
- CloudTrailによるAPIコールの記録
- CloudWatch Logsによる実行ログの保存
- X-Rayによる処理のトレーシング

## 6. エラーハンドリング

### 6.1 リトライ戦略
- Lambda関数は自動的に3回までリトライ
- Bedrock APIのレート制限に対してはバックオフ戦略を実装

### 6.2 エラー通知
- CloudWatchアラームによるエラー検知
- SNSトピックを通じた管理者への通知

## 7. パフォーマンス最適化

### 7.1 Lambda関数
- メモリサイズの適切な設定
- コールドスタート対策としてのウォームアップ

### 7.2 Bedrock API
- 適切なモデルサイズの選択（Claude 3 Sonnet）
- プロンプトの最適化による処理時間短縮

## 8. 運用とメンテナンス

### 8.1 モニタリング
- CloudWatch Dashboardによる可視化
- 主要メトリクス：
  - Lambda関数の実行時間
  - エラー率
  - Bedrock APIのレスポンス時間

### 8.2 コスト最適化
- S3ライフサイクルポリシーによる古いデータの自動削除
- Lambda関数の実行時間最適化
- Bedrock API呼び出し回数の最適化

## 9. 拡張性

### 9.1 スケーリング
- Lambda関数は自動的にスケール
- S3は事実上無制限のストレージ

### 9.2 将来の拡張
- 複数言語対応
- カスタムプロンプトの設定
- 要約の品質向上のための機械学習モデルの追加