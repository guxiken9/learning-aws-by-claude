# 初学者向けガイド：Amazon Connect + Bedrock 要約システム

このガイドでは、AWS初学者の方でも理解できるように、システムの概要から実際のデプロイまでを分かりやすく説明します。

## 📚 目次

1. [このシステムって何？](#このシステムって何)
2. [どんな仕組みで動くの？](#どんな仕組みで動くの)
3. [必要なものは？](#必要なものは)
4. [AWSの基本知識](#awsの基本知識)
5. [手順に沿って設定してみよう](#手順に沿って設定してみよう)
6. [よくある質問と解決方法](#よくある質問と解決方法)

## このシステムって何？

このシステムは、コールセンターの電話を **自動で要約してくれる** システムです。

### 🎯 できること
- 電話の内容を自動で文字にする（文字起こし）
- その文字をAIが読んで、大事なポイントを要約
- 要約をコールセンターのシステムに自動で保存

### 💼 使える場面
- カスタマーサポートセンター
- テレアポの記録管理
- 相談窓口の内容整理
- 通話品質の改善

## どんな仕組みで動くの？

簡単に言うと、以下の流れで動きます：

```
1. お客様とオペレーターが電話で話す
   ↓
2. Amazon Connectが通話を録音・文字起こし
   ↓
3. 文字起こしされたデータをS3（クラウドの保管庫）に保存
   ↓
4. Lambda（小さなプログラム）が動いて、BedrockのAIに「要約して」とお願い
   ↓
5. AIが要約を作成
   ↓
6. 要約をConnectのシステムに自動で登録
```

### 🔍 使われるAWSサービス

| サービス名 | 役割 | 例えで説明 |
|------------|------|------------|
| **Amazon Connect** | 電話システム | コールセンターの電話機 |
| **Contact Lens** | 文字起こし | 通話を聞いて文字にする秘書 |
| **S3** | ファイル保管 | クラウド上の倉庫 |
| **Lambda** | プログラム実行 | 決まった作業をする自動ロボット |
| **Bedrock** | AI要約 | 文章を読んで要約してくれるAI助手 |

## 必要なものは？

### 💻 パソコン環境
- **Node.js 18以上** - プログラムを動かすためのソフト
- **Git** - プログラムのバージョン管理ツール
- **テキストエディタ** - Visual Studio Codeなど

### ☁️ AWSアカウント
- **AWSアカウント** - Amazonのクラウドサービスを使うためのアカウント
- **適切な権限** - 各種サービスを操作できる権限
- **クレジットカード** - AWS利用料金の支払い用（無料枠あり）

### 📞 Amazon Connect
- **Connectインスタンス** - 電話システムの本体
- **電話番号** - お客様がかける電話番号

## AWSの基本知識

### 🏗️ AWS CDKとは？
**CDK（Cloud Development Kit）** は、AWSのインフラをプログラムコードで管理するツールです。

**従来の方法：**
```
AWSコンソール画面で手作業でポチポチ設定
↓
時間がかかる、ミスしやすい、再現性がない
```

**CDKを使った方法：**
```
コードでインフラを定義
↓
自動でAWSリソースを作成・設定
↓
間違いが少ない、再利用できる、バージョン管理可能
```

### 💰 料金の目安

| サービス | 料金の仕組み | 月額目安（100件処理） |
|----------|-------------|---------------------|
| Amazon Connect | 使った分だけ | 約500円 |
| Contact Lens | 分析した通話分数 | 約300円 |
| S3 | 保存容量 | 約50円 |
| Lambda | 実行回数・時間 | 約10円 |
| Bedrock | トークン数 | 約200円 |
| **合計** | - | **約1,060円** |

※実際の料金は使用量により変動します

## 手順に沿って設定してみよう

### ステップ1：環境の準備

#### 1-1. Node.jsのインストール
```bash
# Node.jsのバージョン確認
node --version
# v18.0.0以上が表示されればOK

# インストールされていない場合
# https://nodejs.org/ からダウンロード
```

#### 1-2. AWS CLIのインストール
```bash
# AWS CLIのインストール確認
aws --version
# aws-cli/2.x.x と表示されればOK

# インストールされていない場合
# https://aws.amazon.com/cli/ からダウンロード
```

#### 1-3. AWS認証情報の設定
```bash
aws configure
# AWS Access Key ID: （あなたのアクセスキー）
# AWS Secret Access Key: （あなたのシークレットキー）
# Default region name: ap-northeast-1  ← 東京リージョン
# Default output format: json
```

### ステップ2：プロジェクトのダウンロード

```bash
# プロジェクトをダウンロード
git clone https://github.com/your-username/learning-aws.git
cd learning-aws/connect-bedrock-summary

# 依存関係をインストール
npm install
```

### ステップ3：環境変数の設定

```bash
# 設定ファイルをコピー
cp .env.example .env

# .envファイルを編集
nano .env
```

`.env`ファイルの中身：
```bash
# ここを実際のConnectインスタンスIDに変更
CONNECT_INSTANCE_ID=12345678-1234-1234-1234-123456789012

# リージョン（東京の場合）
AWS_REGION=ap-northeast-1

# 使用するAIモデル（そのままでOK）
BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0
```

### ステップ4：デプロイ

#### 4-1. CDKの初期設定（初回のみ）
```bash
# CDKをブートストラップ
npx cdk bootstrap

# 成功すると以下のようなメッセージが表示されます
# ✅  Environment aws://123456789012/ap-northeast-1 bootstrapped.
```

#### 4-2. デプロイの実行
```bash
# 環境変数を設定
export CONNECT_INSTANCE_ID="あなたのConnectインスタンスID"

# 何が作られるか確認
npx cdk diff

# 実際にデプロイ
npx cdk deploy

# 確認メッセージで「y」を入力
```

#### 4-3. デプロイ完了の確認
成功すると以下のような出力が表示されます：
```
✅  ConnectBedrockSummaryStack

Outputs:
ConnectBedrockSummaryStack.TranscriptionBucketName = connect-transcriptions-123456789012-ap-northeast-1
ConnectBedrockSummaryStack.SummaryBucketName = connect-summaries-123456789012-ap-northeast-1
ConnectBedrockSummaryStack.ErrorNotificationTopicArn = arn:aws:sns:ap-northeast-1:123456789012:...
```

### ステップ5：Amazon Connectの設定

#### 5-1. Connectコンソールにアクセス
1. [Amazon Connectコンソール](https://console.aws.amazon.com/connect/) を開く
2. 作成済みのインスタンスを選択

#### 5-2. Contact Lensの有効化
1. 左メニューから「データストレージ」→「記録とアナリティクス」を選択
2. 「Contact Lens」セクションで「編集」をクリック
3. 「リアルタイム分析を有効にする」をオン
4. 「Call recording analysis」をオン
5. 「S3バケット」に、デプロイ時に出力された`TranscriptionBucketName`を設定

#### 5-3. 通話記録の設定
1. 「通話記録」セクションで「編集」をクリック
2. 「通話記録を有効にする」をオン
3. 上記と同じS3バケットを設定

### ステップ6：テスト実行

#### 6-1. テスト用データの作成
```bash
# テスト用の文字起こしファイルを作成
cat > test-transcription.json << 'EOF'
{
  "contactId": "test-contact-123",
  "segments": [
    {
      "speaker": "Agent",
      "content": "お電話ありがとうございます。本日はどのようなご用件でしょうか？",
      "timestamp": "2024-01-01T10:00:00Z"
    },
    {
      "speaker": "Customer",
      "content": "先日注文した商品がまだ届いていないのですが、配送状況を確認していただけますか？",
      "timestamp": "2024-01-01T10:00:05Z"
    },
    {
      "speaker": "Agent",
      "content": "申し訳ございません。注文番号を教えていただけますでしょうか？",
      "timestamp": "2024-01-01T10:00:15Z"
    },
    {
      "speaker": "Customer",
      "content": "注文番号は ABC-12345 です。",
      "timestamp": "2024-01-01T10:00:20Z"
    },
    {
      "speaker": "Agent",
      "content": "確認いたします。少々お待ちください。確認できました。商品は明日の午前中にお届け予定となっております。",
      "timestamp": "2024-01-01T10:00:40Z"
    },
    {
      "speaker": "Customer",
      "content": "分かりました。ありがとうございます。",
      "timestamp": "2024-01-01T10:01:00Z"
    }
  ],
  "metadata": {
    "startTime": "2024-01-01T10:00:00Z",
    "endTime": "2024-01-01T10:01:10Z",
    "duration": 70
  }
}
EOF
```

#### 6-2. テストファイルのアップロード
```bash
# S3にテストファイルをアップロード
aws s3 cp test-transcription.json s3://connect-transcriptions-あなたのアカウントID-ap-northeast-1/transcriptions/test-contact-123.json
```

#### 6-3. 処理結果の確認
```bash
# Lambda関数のログを確認
aws logs tail /aws/lambda/ConnectBedrockSummaryStack-SummarizerFunction --follow

# 要約ファイルの確認
aws s3 ls s3://connect-summaries-あなたのアカウントID-ap-northeast-1/summaries/

# 要約内容の表示
aws s3 cp s3://connect-summaries-あなたのアカウントID-ap-northeast-1/summaries/test-contact-123-summary.json - | jq '.summary'
```

期待される要約例：
```
【通話の目的】
配送遅延に関する問い合わせと状況確認

【重要なポイント】
• 顧客から注文商品の未着について連絡
• 注文番号：ABC-12345
• 配送予定：明日午前中

【問題の状況】
解決済み - 配送状況を確認し、予定を案内

【アクションアイテム】
• 明日午前中の配送確認
• 配送完了後のフォローアップ

【顧客感情】
ニュートラル（問題解決により満足）
```

## よくある質問と解決方法

### 🤔 Q1: デプロイでエラーが出ます
**A1: よくある原因と解決方法**

```bash
# エラー1: 権限不足
Error: User is not authorized to perform: iam:CreateRole

→ 解決方法: IAM権限を確認
aws iam get-user
# AdministratorAccess または適切な権限があるか確認

# エラー2: リージョンエラー
Error: Region ap-northeast-1 is not supported

→ 解決方法: Bedrockが利用可能なリージョンに変更
# .envファイルでAWS_REGION=us-east-1 に変更
```

### 🤔 Q2: Lambda関数がタイムアウトします
**A2: メモリ・タイムアウト設定の調整**

CDKスタックファイルで以下を変更：
```typescript
// lib/connect-bedrock-summary-stack.ts
const summarizerFunction = new NodejsFunction(this, 'SummarizerFunction', {
  // メモリを増やす
  memorySize: 2048,  // 1024 → 2048
  // タイムアウトを延長
  timeout: cdk.Duration.minutes(10),  // 5分 → 10分
});
```

### 🤔 Q3: Bedrock APIでエラーが出ます
**A3: モデルアクセス権限の確認**

1. [Bedrockコンソール](https://console.aws.amazon.com/bedrock/) を開く
2. 左メニューから「Model access」を選択
3. 「Anthropic Claude 3 Sonnet」が「Access granted」になっているか確認
4. なっていない場合は「Manage model access」から有効化

### 🤔 Q4: 料金が心配です
**A4: コスト管理のベストプラクティス**

```bash
# 1. 予算アラートの設定
aws budgets create-budget --account-id 123456789012 --budget file://budget.json

# 2. 不要時のリソース削除
npx cdk destroy

# 3. S3の古いファイル削除（自動設定済み）
# - 文字起こしデータ: 90日後に削除
# - 要約データ: 365日後に削除
```

### 🤔 Q5: ログを確認したいです
**A5: 各種ログの確認方法**

```bash
# Lambda関数のログ
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/ConnectBedrockSummaryStack"

# 特定の関数のリアルタイムログ
aws logs tail /aws/lambda/ConnectBedrockSummaryStack-SummarizerFunction --follow

# エラーのみ表示
aws logs filter-log-events \
  --log-group-name /aws/lambda/ConnectBedrockSummaryStack-SummarizerFunction \
  --filter-pattern "ERROR"

# CloudWatchでのグラフィカル表示
# https://console.aws.amazon.com/cloudwatch/
```

### 🤔 Q6: 本番環境で使う前の注意点
**A6: 本番利用のためのチェックリスト**

```markdown
□ セキュリティ設定の確認
  - IAMロールが最小権限になっているか
  - S3バケットがパブリックアクセス不可になっているか
  - 暗号化が有効になっているか

□ 監視・アラート設定
  - CloudWatchアラームが設定されているか
  - SNS通知先が正しく設定されているか
  - ログ保持期間が適切か

□ バックアップ・復旧手順
  - S3バケットのバージョニングが有効か
  - 災害復旧手順が文書化されているか

□ 性能・容量計画
  - 想定通話数でのテストが完了しているか
  - Lambda関数のメモリ・タイムアウトが適切か
  - コスト見積もりが完了しているか
```

## 🎉 おめでとうございます！

これでAmazon Connect + Bedrock要約システムの構築が完了しました。

**次のステップ：**
1. 実際の通話でテストしてみる
2. 要約の品質を確認・調整
3. 本番運用に向けた監視設定
4. チームメンバーへの使い方説明

**困ったときは：**
- 各種ログを確認
- AWSサポートに問い合わせ
- 開発者コミュニティで相談

システムの改善や機能追加のアイデアがあれば、ぜひ実装にチャレンジしてみてください！