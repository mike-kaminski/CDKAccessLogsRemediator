import {
  Database,
  Table,
  Schema,
  DataFormat,
  SerializationLibrary,
  InputFormat,
  OutputFormat,
} from "@aws-cdk/aws-glue-alpha";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import { aws_athena as athenaCfn } from "aws-cdk-lib";
import { CfnTable } from "aws-cdk-lib/aws-glue";
/**
 * Adds the AWS Glue resources needed to query ALB logs
 * using AWS Athena
 * @param scope
 * @param s3bucketArn
 * @param prefix
 * @param stage
 */
export const addAlbGlueResources = (
  scope: Construct,
  s3Bucket: s3.IBucket,
  prefix: string,
  stage: string
): void => {
  // https://docs.aws.amazon.com/athena/latest/ug/tables-databases-columns-names.html
  const databaseName = `${prefix}_database_${stage}`.toLowerCase();
  const tableName = `${prefix}_table_${stage}`.toLowerCase();
  const glueDb = new Database(scope, `${prefix}AlbGlueDatabase${stage}`, {
    databaseName,
  });

  // https://docs.aws.amazon.com/athena/latest/ug/application-load-balancer-logs.html
  const tableColumns = [
    {
      name: "type",
      type: Schema.STRING,
    },
    {
      name: "time",
      type: Schema.STRING,
    },
    {
      name: "elb",
      type: Schema.STRING,
    },
    {
      name: "client_ip",
      type: Schema.STRING,
    },
    {
      name: "client_port",
      type: Schema.INTEGER,
    },
    {
      name: "target_ip",
      type: Schema.STRING,
    },
    {
      name: "target_port",
      type: Schema.INTEGER,
    },

    {
      name: "request_processing_time",
      type: Schema.DOUBLE,
    },
    {
      name: "target_processing_time",
      type: Schema.DOUBLE,
    },
    {
      name: "response_processing_time",
      type: Schema.DOUBLE,
    },
    {
      name: "elb_status_code",
      type: Schema.INTEGER,
    },
    {
      name: "target_status_code",
      type: Schema.STRING,
    },
    {
      name: "received_bytes",
      type: Schema.BIG_INT,
    },
    {
      name: "sent_bytes",
      type: Schema.BIG_INT,
    },
    {
      name: "request_verb",
      type: Schema.STRING,
    },
    {
      name: "request_url",
      type: Schema.STRING,
    },
    {
      name: "request_proto",
      type: Schema.STRING,
    },
    {
      name: "user_agent",
      type: Schema.STRING,
    },
    {
      name: "ssl_cipher",
      type: Schema.STRING,
    },
    {
      name: "ssl_protocol",
      type: Schema.STRING,
    },
    {
      name: "target_group_arn",
      type: Schema.STRING,
    },
    {
      name: "trace_id",
      type: Schema.STRING,
    },
    {
      name: "domain_name",
      type: Schema.STRING,
    },
    {
      name: "chosen_cert_arn",
      type: Schema.STRING,
    },
    {
      name: "matched_rule_priority",
      type: Schema.STRING,
    },
    {
      name: "request_creation_time",
      type: Schema.STRING,
    },
    {
      name: "actions_executed",
      type: Schema.STRING,
    },
    {
      name: "redirect_url",
      type: Schema.STRING,
    },
    {
      name: "lambda_error_reason",
      type: Schema.STRING,
    },
    {
      name: "target_port_list",
      type: Schema.STRING,
    },
    {
      name: "target_status_code_list",
      type: Schema.STRING,
    },
    {
      name: "classification",
      type: Schema.STRING,
    },
    {
      name: "classification_reason",
      type: Schema.STRING,
    },
  ];

  const serializationLibrary = SerializationLibrary.REGEXP;
  const athenaTable = new Table(scope, `${prefix}AlbGlueTable${stage}`, {
    database: glueDb,
    tableName,
    bucket: s3Bucket,
    // `AWSLogs` is hardcoded by https://docs.aws.amazon.com/athena/latest/ug/application-load-balancer-logs.html
    s3Prefix: "AWSLogs",
    columns: tableColumns,
    dataFormat: new DataFormat({
      inputFormat: new InputFormat("org.apache.hadoop.mapred.TextInputFormat"),
      outputFormat: new OutputFormat(
        "org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat"
      ),
      serializationLibrary,
    }),
  });

  // Escape hatches are needed to define Athena props not supported in cdk https://github.com/aws/aws-cdk/issues/16660
  const cfnTable = athenaTable.node.defaultChild as CfnTable;
  // All of these settings are documented on https://docs.aws.amazon.com/athena/latest/ug/application-load-balancer-logs.html
  cfnTable.addPropertyOverride(
    "TableInput.StorageDescriptor.SerdeInfo.Parameters.serialization\\.format",
    1
  );
  cfnTable.addPropertyOverride(
    "TableInput.StorageDescriptor.SerdeInfo.Parameters.input\\.regex",
    '([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*):([0-9]*) ([^ ]*)[:-]([0-9]*) ([-.0-9]*) ([-.0-9]*) ([-.0-9]*) (|[-0-9]*) (-|[-0-9]*) ([-0-9]*) ([-0-9]*) "([^ ]*) (.*) (- |[^ ]*)" "([^"]*)" ([A-Z0-9-_]+) ([A-Za-z0-9.-]*) ([^ ]*) "([^"]*)" "([^"]*)" "([^"]*)" ([-.0-9]*) ([^ ]*) "([^"]*)" "([^"]*)" "([^ ]*)" "([^s]+?)" "([^s]+)" "([^ ]*)" "([^ ]*)"'
  );

  addAlbAthenaSavedQuery(
    scope,
    glueDb.databaseName,
    athenaTable.tableName,
    // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-athena-workgroup-resultconfiguration.html#cfn-athena-workgroup-resultconfiguration-outputlocation
    `s3://${s3Bucket.bucketName}/AthenaQueryOutput`,
    prefix,
    stage
  );
};

/**
 * Creates a saved query in Athena
 * @param scope
 * @param glueDb
 * @param athenaTableName
 * @param queryOutputLocation
 * @param prefix
 * @param stage
 */
const addAlbAthenaSavedQuery = (
  scope: Construct,
  glueDbName: string,
  athenaTableName: string,
  queryOutputLocation: string,
  prefix: string,
  stage: string
): void => {
  const athenaWorkgroup = new athenaCfn.CfnWorkGroup(
    scope,
    `${prefix}AlbAthenaWorkgroup${stage}`,
    {
      name: `${prefix}AlbAthenaWorkgroup${stage}`,
      workGroupConfiguration: {
        resultConfiguration: {
          outputLocation: queryOutputLocation,
        },
      },
    }
  );

  const queryString = `SELECT * FROM "${glueDbName}"."${athenaTableName}" limit 1000;`;
  new athenaCfn.CfnNamedQuery(scope, `${prefix}AlbAthenaQuery${stage}`, {
    database: glueDbName,
    queryString: queryString,
    description: `Query ALB Logs using Athena`,
    name: `${prefix}AlbAthenaQuery${stage}`,
    workGroup: athenaWorkgroup.name,
  });
};
