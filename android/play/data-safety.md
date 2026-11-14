# Data safety form

Answers for the Data safety section in Play Console (App content). They match what the app does today and the policy at https://coursesmash.app/privacy. Update this file, the form and `public/privacy.html` together whenever the app starts or stops collecting something.

## Overview

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | Yes |
| Is all of the user data collected by your app encrypted in transit? | Yes. Release builds only talk to the server over HTTPS. |
| Do you provide a way for users to request that their data is deleted? | Yes. Deleting a course in the app deletes its questions and answers. Account deletion is by request at https://coursesmash.app/support. |
| Is any data shared with third parties? | No. Cloudflare hosts the server and runs the AI models as a service provider, which Play does not count as sharing. |

## Data types

| Data type | Collected | Shared | Processed ephemerally | Required | Purpose |
|---|---|---|---|---|---|
| Personal info: User IDs (the username) | Yes | No | No | Required | App functionality, Account management |
| App activity: Other user-generated content (what you want to learn, your answers) | Yes | No | No | Required | App functionality, Personalization |

Nothing else is collected: no location, contacts, photos, files, device or advertising IDs, diagnostics or analytics.

## Why these answers

- The app has one permission, `INTERNET`, and no third-party SDKs.
- The password is sent once over HTTPS to log in and is never stored on the device. The server stores only a salted hash.
- After login the app keeps a session token in its private storage, encrypted with a key in the Android Keystore. Backups and device-to-device transfer are switched off for it (`data_extraction_rules.xml`).
- What you want to learn and what you answer go to AI models on Cloudflare Workers AI to write questions, grade short answers and write feedback. That is why "Personalization" is listed.

## Other App content declarations

| Declaration | Answer |
|---|---|
| Privacy policy | https://coursesmash.app/privacy |
| Ads | No ads |
| App access | Login required. Give reviewers a demo username and password under App access. Do not put them in this repository. |
| Target audience | 13 and over. Not designed for children. |
| Content rating | Complete the questionnaire: an education app with no violence, sexual content, gambling or user-to-user communication. |
| Government app, financial features, health | No |
| AI-generated content | The app shows questions and feedback written by AI models. Point reviewers to the support page for reporting a wrong one. |
