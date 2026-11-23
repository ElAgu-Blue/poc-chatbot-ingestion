#!/bin/sh
set -eu

endpoint_url="${AWS_ENDPOINT_URL:-http://localstack:4566}"
aws() {
  awslocal --endpoint-url="$endpoint_url" "$@"
}
topic_name="topic-oneblue-chat-interactions"
queue_name="queue-oneblue-chat-interactions-mover"
dlq_name="${queue_name}-dlq"

topic_arn=$(aws sns create-topic --name "$topic_name" --query TopicArn --output text)
queue_url=$(aws sqs create-queue --queue-name "$queue_name" --query QueueUrl --output text)
dlq_url=$(aws sqs create-queue --queue-name "$dlq_name" --query QueueUrl --output text)
queue_arn=$(aws sqs get-queue-attributes --queue-url "$queue_url" --attribute-names QueueArn --query Attributes.QueueArn --output text)
dlq_arn=$(aws sqs get-queue-attributes --queue-url "$dlq_url" --attribute-names QueueArn --query Attributes.QueueArn --output text)

cat > /tmp/redrive-policy.json <<EOF
{"RedrivePolicy":"{\"deadLetterTargetArn\":\"$dlq_arn\",\"maxReceiveCount\":\"3\"}"}
EOF

aws sqs set-queue-attributes \
  --queue-url "$queue_url" \
  --attributes file:///tmp/redrive-policy.json

cat > /tmp/queue-policy.json <<EOF
{"Policy":"{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"AllowSnsPublish\",\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"sns.amazonaws.com\"},\"Action\":\"sqs:SendMessage\",\"Resource\":\"$queue_arn\",\"Condition\":{\"ArnEquals\":{\"aws:SourceArn\":\"$topic_arn\"}}}]}"}
EOF

aws sqs set-queue-attributes \
  --queue-url "$queue_url" \
  --attributes file:///tmp/queue-policy.json

aws sns subscribe \
  --topic-arn "$topic_arn" \
  --protocol sqs \
  --notification-endpoint "$queue_arn" \
  --attributes RawMessageDelivery=false \
  --query SubscriptionArn \
  --output text

printf 'LocalStack ready: topic=%s queue=%s dlq=%s\n' "$topic_arn" "$queue_url" "$dlq_url"
