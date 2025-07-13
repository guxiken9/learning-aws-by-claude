# 🚀 クイックスタートガイド

このガイドに従えば、約30分でAmazon Connect + Bedrockシステムを動かせます！

## ⚡ 5分で理解：このシステムとは？

コールセンターの電話を **AIが自動で要約** してくれるシステムです。

```
電話する → 文字起こし → AI要約 → 自動保存
```

## 📋 事前準備（5分）

✅ 必要なもの：
- AWSアカウント（無料利用枠あり）
- Node.js 18以上
- Amazon Connectインスタンス

## 🛠️ セットアップ（15分）

### 1. プロジェクトのダウンロード
```bash
git clone https://github.com/your-username/learning-aws.git
cd learning-aws/connect-bedrock-summary
npm install
```

### 2. AWS認証設定
```bash
aws configure
# アクセスキーとシークレットキーを入力
```

### 3. 環境変数設定
```bash
cp .env.example .env
# .envファイルのCONNECT_INSTANCE_IDを実際の値に変更
```

### 4. デプロイ
```bash
npx cdk bootstrap  # 初回のみ
npx cdk deploy     # デプロイ実行
```

## 🧪 テスト実行（5分）

### テストファイルをS3にアップロード
```bash
# テスト用データ作成
cat > test.json << 'EOF'
{
  "contactId": "test-123",
  "segments": [
    {"speaker": "Agent", "content": "お電話ありがとうございます", "timestamp": "2024-01-01T10:00:00Z"},
    {"speaker": "Customer", "content": "注文した商品が届きません", "timestamp": "2024-01-01T10:00:05Z"},
    {"speaker": "Agent", "content": "申し訳ございません。確認いたします", "timestamp": "2024-01-01T10:00:10Z"}
  ],
  "metadata": {"startTime": "2024-01-01T10:00:00Z", "endTime": "2024-01-01T10:00:30Z", "duration": 30}
}
EOF

# S3にアップロード
aws s3 cp test.json s3://connect-transcriptions-$(aws sts get-caller-identity --query Account --output text)-ap-northeast-1/transcriptions/test-123.json
```

### 結果確認
```bash
# 処理ログ確認
aws logs tail /aws/lambda/ConnectBedrockSummaryStack-SummarizerFunction --follow

# 要約結果確認（1-2分後）
aws s3 ls s3://connect-summaries-$(aws sts get-caller-identity --query Account --output text)-ap-northeast-1/summaries/
```

## ✅ 成功の確認

以下が表示されれば成功：
- Lambdaログに「Summary created for contact: test-123」
- S3に「test-123-summary.json」ファイルが作成される

## 🎯 次のステップ

1. **Amazon Connect設定**: Contact Lensを有効化
2. **実際の通話テスト**: 本物の電話でテスト
3. **カスタマイズ**: 要約プロンプトを調整

## 🆘 困ったときは

### よくあるエラー
```bash
# 権限エラー
Error: User is not authorized
→ IAM権限を確認

# リージョンエラー  
Error: Region not supported
→ .envのAWS_REGIONを us-east-1 に変更

# タイムアウト
Error: Task timed out
→ Lambdaのメモリを2048MBに増加
```

### ヘルプ
- 📖 [詳細ガイド](docs/beginner-guide.md)
- 🔧 [トラブルシューティング](docs/beginner-guide.md#よくある質問と解決方法)
- 💬 [GitHub Issues](https://github.com/your-username/learning-aws/issues)

## 🧹 クリーンアップ

テスト完了後、料金を避けるため：
```bash
npx cdk destroy  # リソース削除
```

---

**🎉 お疲れ様でした！** AIによる通話要約システムが動作しているはずです。