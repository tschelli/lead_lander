# AWS deployment (ECS Fargate + ALB + optional CloudFront)

This guide assumes you are deploying two services:

- API (Express) behind an ALB
- Worker (BullMQ) with no public access

## 1) Build + push images to ECR

API:

```
docker build -f apps/api/Dockerfile -t lead-lender-api .
```

Worker:

```
docker build -f apps/worker/Dockerfile -t lead-lender-worker .
```

Push both to ECR (replace account/region):

```
aws ecr create-repository --repository-name lead-lender-api --region <REGION>
aws ecr create-repository --repository-name lead-lender-worker --region <REGION>

aws ecr get-login-password --region <REGION> | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com

docker tag lead-lender-api:latest <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/lead-lender-api:latest
docker tag lead-lender-worker:latest <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/lead-lender-worker:latest

docker push <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/lead-lender-api:latest
docker push <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/lead-lender-worker:latest
```

## 2) Create ECS resources

- Create an ECS cluster (Fargate).
- Create an Application Load Balancer + target group (health check path `/healthz`).
- Register task definitions using templates in `infra/ecs/task-def-*.json`.
- Create services using `infra/ecs/service-*.json` (set subnets, security groups, target group ARN).

## 3) Run migrations

From your machine (or a one-off task inside the VPC):

```
DATABASE_URL=postgres://USER:PASS@RDS_ENDPOINT:5432/lead_lander npm run migrate
```

## 4) HTTPS for the API

If you have a domain, use an ACM cert and an HTTPS listener on the ALB.

If you do NOT have a domain yet, use CloudFront to get an HTTPS URL:

1. Create a CloudFront distribution.
2. Set **Origin** to the ALB DNS name (e.g., `my-alb-123.us-east-1.elb.amazonaws.com`).
3. Set **Viewer protocol policy** to `Redirect HTTP to HTTPS`.
4. Set **Cache policy** to `CachingDisabled` or add `/api/*` as a behavior with `CachingDisabled`.
5. Copy the CloudFront domain (e.g., `d123.cloudfront.net`).

Use that CloudFront domain as your API base URL for Vercel:

```
NEXT_PUBLIC_API_BASE_URL=https://d123.cloudfront.net
```

## 5) Update Vercel env vars

Set:

```
NEXT_PUBLIC_API_BASE_URL=https://<your-api-domain>
```

## Notes

- Set `CONFIG_DIR=/app/configs` in ECS env vars so the API/worker can read repo configs.
- For secrets (DB password, CRM token), prefer Secrets Manager or SSM, but env vars are fine for testing.
