import { App, Stack, StackProps, Duration, RemovalPolicy } from "aws-cdk-lib";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  LifecycleRule,
} from "aws-cdk-lib/aws-s3";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Topic } from "aws-cdk-lib/aws-sns";
import { LambdaSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import {
  AccountPrincipal,
  ManagedPolicy,
  PolicyStatement,
} from "aws-cdk-lib/aws-iam";
import { RetentionDays } from "aws-cdk-lib/aws-logs";
import * as path from "path";
import {
  ManagedRule,
  CfnRemediationConfiguration,
  ResourceType,
  RuleScope,
  ManagedRuleIdentifiers,
} from "aws-cdk-lib/aws-config";
import { BuildConfig } from "./BuildConfig";
import { addAlbGlueResources } from "./GlueHelpers";

export class LogStack extends Stack {
  constructor(
    app: App,
    id: string,
    stackProps: StackProps,
    buildConfig: BuildConfig
  ) {
    super(app, id, stackProps);

    // Create the S3 bucket and policies.
    const elbLogsBucket = new Bucket(this, "Bucket", {
      bucketName:
        `${buildConfig.Product}${buildConfig.Environment}`.toLowerCase(),
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const lifecycleRule: LifecycleRule = {
      enabled: true,
      expiration: Duration.days(buildConfig.LogRetentionDays),
      id: `${buildConfig.Product}${buildConfig.Environment}`,
      prefix: "AWSLogs",
    };

    elbLogsBucket.addLifecycleRule(lifecycleRule);

    const elbLogsBucketPolicy = new PolicyStatement({
      actions: ["s3:PutObject"],
      principals: [new AccountPrincipal(buildConfig.ElbAccountId)],
      resources: [`arn:aws:s3:::${elbLogsBucket.bucketName}/*`],
    });

    elbLogsBucket.addToResourcePolicy(elbLogsBucketPolicy);

    // Create sns topic
    const topic = new Topic(this, "elbLogsTopic", {
      topicName: `elbLogsTopic${buildConfig.Environment}`,
      displayName: `elbLogsTopic${buildConfig.Environment}`,
    });

    // Create lambda function
    const elbLogsUpdater = new NodejsFunction(this, "elbLogsUpdater", {
      functionName: `elbLogsUpdater${buildConfig.Environment}`,
      memorySize: 256,
      timeout: Duration.seconds(10),
      runtime: Runtime.NODEJS_16_X,
      handler: "main",
      entry: path.join(__dirname, `./src/index.ts`),
      environment: {
        ELB_LOG_BUCKET: elbLogsBucket.bucketName,
      },
      logRetention: RetentionDays.ONE_MONTH,
    });

    elbLogsUpdater.role?.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName("AmazonSNSReadOnlyAccess")
    );
    elbLogsUpdater.role?.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName("ElasticLoadBalancingFullAccess")
    );

    // Subscribe Lambda to SNS topic
    topic.addSubscription(new LambdaSubscription(elbLogsUpdater));

    // AWS Config remediation
    const configRule = new ManagedRule(this, "ConfigElbLogsEnabled", {
      configRuleName: `${buildConfig.Environment.toLowerCase()}-elb-logs-enabled`,
      identifier: ManagedRuleIdentifiers.ELB_LOGGING_ENABLED,
      ruleScope: RuleScope.fromResources([ResourceType.ELBV2_LOAD_BALANCER]),
      inputParameters: {
        s3BucketNames: elbLogsBucket.bucketName,
      },
    });

    const remediationConfiguration = new CfnRemediationConfiguration(
      this,
      "ElbLogsEnabledRemediationConfiguration",
      {
        configRuleName: configRule.configRuleName,
        targetId: "AWS-PublishSNSNotification",
        targetType: "SSM_DOCUMENT",
        automatic: false,
        parameters: {
          Message: { ResourceValue: { Value: "RESOURCE_ID" } },
          TopicArn: { StaticValue: { Values: [topic.topicArn] } },
        },
        maximumAutomaticAttempts: 2,
        retryAttemptSeconds: 60,
      }
    );
    remediationConfiguration.node.addDependency(configRule);

    addAlbGlueResources(
      this,
      elbLogsBucket,
      buildConfig.Product,
      buildConfig.AWSAccountID
    );
  }
}

export default LogStack;
