# CLAUDE.md

このファイルは、Claude Code (claude.ai/code) がこのリポジトリで作業する際のガイダンスを提供します。

## プロジェクト概要

これはAWS CDK（Cloud Development Kit）を使用したクラウドソリューションの実装に焦点を当てたAWS学習プロジェクトです。特にAmazon ConnectとBedrockを使用した通話の文字起こしと要約システムの実装例とドキュメントが含まれています。

## よく使うコマンド

Amazon Connect + Bedrockシステムの開発・運用で使用するコマンド：

```bash
# 実装プロジェクトでの作業
cd connect-bedrock-summary

# ビルドとテスト
npm run build        # TypeScriptコンパイル
npm run watch        # ファイル変更監視
npm run test         # Jestテスト実行

# CDK操作
npx cdk bootstrap    # 初回セットアップ（一度のみ）
npx cdk synth        # CloudFormationテンプレート生成
npx cdk diff         # デプロイ差分確認
npx cdk deploy       # スタックデプロイ
npx cdk destroy      # スタック削除

# 環境設定
export CONNECT_INSTANCE_ID="your-connect-instance-id"
cp .env.example .env # 環境変数設定
```

## アーキテクチャと構造

### 現在の状態
- **実装済み**: 完全なAmazon Connect + Bedrockシステムを実装
- **AWS CDKベース**: TypeScriptとAWS CDK v2を使用
- **本格運用可能**: Lambda関数、S3、IAMロール等すべて実装完了

### ドキュメント化されたアーキテクチャ
Amazon Connect + Bedrock通話要約システムのドキュメント：
```
Amazon Connect → Contact Lens → S3 → Lambda → Bedrock → S3 → Connect Contact Attributes
```

主要コンポーネント：
- **Amazon Connect**: Contact Lensによる文字起こし機能を持つコールセンタープラットフォーム
- **S3バケット**: 文字起こしとAI生成要約の保存
- **Lambda関数**: 文字起こし処理とコンタクト属性の更新
- **Amazon Bedrock**: Claudeを使用した通話要約生成のAIサービス

### 実装時の注意点
ドキュメントに基づいて実装を作成する際：

1. **CDKパターンに従う**: aws-cdk-lib v2のインポートを使用
2. **TypeScript設定**: Node.js 18.x以上をターゲット
3. **セキュリティ**: 常にS3暗号化を有効化、最小権限のIAMポリシーを使用
4. **モニタリング**: CloudWatchログとX-Rayトレーシングを含める
5. **環境変数**: 設定にはCDKコンテキストまたは環境変数を使用

## 重要な注意事項

- `/connect-bedrock-summary/`ディレクトリに完全なCDK実装が含まれています
- `docs/`フォルダに詳細な設計資料（system-design.md、implementation-guide.md、api-specifications.md）があります
- デプロイ前に環境変数（CONNECT_INSTANCE_ID等）の設定が必要です
- セキュリティとコスト最適化のベストプラクティスが実装済みです
- 本番利用前にはテスト環境での動作確認を推奨します