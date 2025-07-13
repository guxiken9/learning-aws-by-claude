import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

export class ConnectBedrockSummaryStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3バケット - 文字起こしデータ保存
    const transcriptionBucket = new s3.Bucket(this, 'TranscriptionBucket', {
      bucketName: `connect-transcriptions-${this.account}-${this.region}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [{
        id: 'delete-old-transcriptions',
        expiration: cdk.Duration.days(90),
        noncurrentVersionExpiration: cdk.Duration.days(30),
      }],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // S3バケット - 要約データ保存
    const summaryBucket = new s3.Bucket(this, 'SummaryBucket', {
      bucketName: `connect-summaries-${this.account}-${this.region}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [{
        id: 'delete-old-summaries',
        expiration: cdk.Duration.days(365),
      }],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Lambda実行ロール
    const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Bedrock権限の追加
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
      ],
      resources: [
        `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0`,
      ],
    }));

    // S3権限の追加
    transcriptionBucket.grantRead(lambdaRole);
    summaryBucket.grantReadWrite(lambdaRole);

    // Connect権限の追加
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'connect:UpdateContactAttributes',
        'connect:DescribeContact',
      ],
      resources: ['*'], // 実際の環境では特定のConnectインスタンスに限定
    }));

    // Lambda関数 - 要約処理
    const summarizerFunction = new NodejsFunction(this, 'SummarizerFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handler',
      entry: 'lib/lambda/summarizer/index.ts',
      role: lambdaRole,
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      environment: {
        SUMMARY_BUCKET: summaryBucket.bucketName,
        BEDROCK_MODEL_ID: 'anthropic.claude-3-sonnet-20240229-v1:0',
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
      tracing: lambda.Tracing.ACTIVE,
    });

    // S3イベント通知の設定 - 文字起こしデータ
    transcriptionBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(summarizerFunction),
      {
        prefix: 'transcriptions/',
        suffix: '.json',
      }
    );

    // Lambda関数 - Contact属性更新
    const contactUpdaterFunction = new NodejsFunction(this, 'ContactUpdaterFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'handler',
      entry: 'lib/lambda/contact-updater/index.ts',
      role: lambdaRole,
      timeout: cdk.Duration.minutes(2),
      memorySize: 512,
      environment: {
        CONNECT_INSTANCE_ID: process.env.CONNECT_INSTANCE_ID || '',
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
      tracing: lambda.Tracing.ACTIVE,
    });

    // S3イベント通知の設定 - 要約データ
    summaryBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(contactUpdaterFunction),
      {
        prefix: 'summaries/',
        suffix: '.json',
      }
    );

    // エラー通知用SNSトピック
    const errorTopic = new sns.Topic(this, 'ErrorNotificationTopic', {
      displayName: 'Connect Bedrock Summary Errors',
    });

    // CloudWatchアラーム - Summarizerエラー
    const summarizerErrorAlarm = new cloudwatch.Alarm(this, 'SummarizerErrorAlarm', {
      metric: summarizerFunction.metricErrors(),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: 'Error in Summarizer Lambda function',
    });

    summarizerErrorAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(errorTopic)
    );

    // CloudWatchアラーム - ContactUpdaterエラー
    const contactUpdaterErrorAlarm = new cloudwatch.Alarm(this, 'ContactUpdaterErrorAlarm', {
      metric: contactUpdaterFunction.metricErrors(),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: 'Error in ContactUpdater Lambda function',
    });

    contactUpdaterErrorAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(errorTopic)
    );

    // 出力
    new cdk.CfnOutput(this, 'TranscriptionBucketName', {
      value: transcriptionBucket.bucketName,
      description: 'S3 bucket for Connect transcriptions',
    });

    new cdk.CfnOutput(this, 'SummaryBucketName', {
      value: summaryBucket.bucketName,
      description: 'S3 bucket for summaries',
    });

    new cdk.CfnOutput(this, 'ErrorNotificationTopicArn', {
      value: errorTopic.topicArn,
      description: 'SNS topic for error notifications',
    });
  }
}
