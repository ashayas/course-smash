# App Privacy answers

Answers for the App Privacy section in App Store Connect (the "privacy nutrition label"). They match `CourseSmash/Resources/PrivacyInfo.xcprivacy` and the policy at https://coursesmash.app/privacy. Change all three together whenever the app starts or stops collecting something. The form has to be filled in by hand in App Store Connect, or with `fastlane upload_app_privacy_details_to_app_store`, which signs in with an Apple ID and not with an API key.

## Do you or your third-party partners collect data from this app?

Yes.

## Data types

| Data type | What it is here | Linked to the user | Used for tracking | Purpose |
|---|---|---|---|---|
| Identifiers: User ID | The username | Yes | No | App Functionality |
| User Content: Other User Content | What you say you want to learn, and your answers in courses and in daily recall | Yes | No | App Functionality |
| Usage Data: Product Interaction | How many questions you answered on each day, which makes the streak, and when the account was last active | Yes | No | App Functionality |
| Other Data: Other Data Types | The name of the phone's time zone, such as Europe/Paris, and three settings: the daily goal, whether recall includes short answers, and which courses daily recall draws from | Yes | No | App Functionality |

Nothing else is collected: no contact info, health, financial info, location, contacts, photos, browsing or search history, purchases, diagnostics, advertising data or device ID.

## Why these answers

- **Usage Data** is new in 1.2.0. The server keeps a count of answers per day so it can show a streak, and the time the account last called it. Apple's "Product Interaction" covers how a person uses the app, so it is declared, even though both are worked out from answers the app already sends.
- **Other Data** is new in 1.2.0. Every request carries the time zone's name, and the server keeps it with the account so a day starts and ends when the learner's does. It is a setting, not a location: nothing finer than the zone's name is sent, and the app asks for no location permission. Apple has no data type for it, so it goes under Other Data Types.
- **Tracking:** none. Nothing is shared with data brokers or used for advertising, and the app has no third-party SDK.
- **AI models:** what you want to learn and what you answer go to models on Cloudflare Workers AI to write questions, grade short answers and write feedback. Cloudflare is a service provider, and the models get the text, not the username.
