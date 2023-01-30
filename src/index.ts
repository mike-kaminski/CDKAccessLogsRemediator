import { SNSEvent } from "aws-lambda";
import {
  ElasticLoadBalancingV2Client,
  ModifyLoadBalancerAttributesCommand,
} from "@aws-sdk/client-elastic-load-balancing-v2";

export async function main(event: SNSEvent): Promise<void> {
  const message = event.Records[0].Sns.Message;
  console.log("Adding ALB resource: ", message);

  const input = {
    LoadBalancerArn: message,
    Attributes: [
      {
        Key: "access_logs.s3.enabled",
        Value: "true",
      },
      {
        Key: "access_logs.s3.bucket",
        Value: String(process.env.ELB_LOG_BUCKET),
      },
      {
        Key: "access_logs.s3.prefix",
        Value: "",
      },
    ],
  };

  const client = new ElasticLoadBalancingV2Client({});
  const command = new ModifyLoadBalancerAttributesCommand(input);
  try {
    const data = await client.send(command);
    console.log(JSON.stringify(data));
  } catch (error) {
    console.log(error);
  }
}
