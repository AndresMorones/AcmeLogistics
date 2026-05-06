# Technical Challenge — Inbound Carrier Sales

> Canonical specification. Every decision in the project anchors back to this document.

## Overview

You are meeting with a customer (played by the interviewer) to present a solution you built using the HappyRobot platform. The customer is evaluating vendors to handle inbound carrier load sales automation. Your agent will receive calls from carriers looking to book loads. Your task is to show a working proof of concept and demonstrate both technical depth and customer-centric thinking.

## 📦 Goals

### 🤖 Objective 1: Implement Inbound Use Case

A freight brokerage wants to automate inbound carrier calls. Carriers call in to request loads. The system must vet them, match them to viable loads, and negotiate pricing automatically.

- Use the HappyRobot platform to create an inbound agent where the AI assistant gets calls from carriers.
- The loads will be searched using an API in a file or DB which will contain the context within the following fields for each load:

| Field | Description |
|---|---|
| load_id | Unique identifier for the load |
| origin | Starting location |
| destination | Delivery location |
| pickup_datetime | Date and time for pickup |
| delivery_datetime | Date and time for delivery |
| equipment_type | Type of equipment needed |
| loadboard_rate | Listed rate for the load |
| notes | Additional information |
| weight | Load weight |
| commodity_type | Type of goods |
| num_of_pieces | Number of items |
| miles | Distance to travel |
| dimensions | Size measurements |

The assistant must:

- Get their MC number and verify they are eligible to work with using the FMCSA API.
- Search the load and pitch the details.
- Ask if they're interested in accepting the load.
- If they make a counter offer evaluate it. **Handle up to 3 back and forth's negotiating the offer.**
- If a price is agreed, transfer the call to a sales rep. Transfer is out of scope as it won't work with the web call, you can mock a message like "Transfer was successful and now you can wrap up the conversation".
- Extract from the call the most relevant data for the offer.
- Classify the call based on its outcome.
- Classify the sentiment of the carrier in the call.

### 📊 Objective 2: Metrics

- You must create a dashboard/report mechanism to show use case metrics → Don't use the platform analytics and rather build something yourself as we want to assess your product vision and build capabilities.

### ⚙️ Objective 3: Deployment and infrastructure

- Containerize the solution with Docker.

## 🧪 Deliverables

1. An email to your prospect client (with your recruiter in cc) indicating your latest advancements ahead of your meeting with them.
2. Write a document as if you were submitting the build description to a real freight broker (e.g., "Acme Logistics").
3. Access to your deployed dashboard.
4. Link to your code repository.
5. Link to the workflow in the HappyRobot platform.
6. A short video (5 mins) walking through:
   - Use case setup
   - Short demo
   - Dashboard

## 🛡️ Additional Considerations

### 1. Security

If you're creating an API, add basic security features such as:
- HTTPS (self-signed locally is fine, use Let's Encrypt or equivalent if deployed)
- API key authentication for all endpoints

### 2. Deployment

- Deploy your API to a cloud provider of your choice (e.g., AWS, Google Cloud, Azure, Fly.io, Railway, etc.)
- Provide clear instructions on how to:
  - Access the deployment.
  - Reproduce your deployment if needed (e.g., Terraform, shell script, or manual steps)

### 3. Calls

- Do not buy a phone number on the platform.

## How to use this document

Every decision in the project (architecture, scope, what to build, what to defer, what to test) anchors back to a clause in this document. If a decision can't be traced to the spec, it's arbitrary and gets challenged.
