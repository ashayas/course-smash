// The store screenshots, shared by the script that makes them and the gallery that shows them.

/** The store screenshots, in store order: the capture each uses, its headline and the line under it. */
export const SHOTS = [
  { name: "today", capture: "store-today", headline: "A few questions a day, from what you've learned", line: "Daily recall takes a few minutes." },
  // `lower`: what matters here is at the bottom of the screen, so the picture is a close crop of the lower part of
  // the phone, a little larger than the others, with the status bar and the progress row cut off. `true` for
  // both apps, or an object naming the app it applies to.
  { name: "recall", capture: "store-recall-right", headline: "Get it right and it comes back later", line: "Miss it and it comes back sooner.", lower: true },
  { name: "streak", capture: "store-recall-done", headline: "Answer five and the day counts", line: "Days in a row make your streak." },
  { name: "city", capture: "store-city", headline: "Every course is a building in your city", line: "One floor per module. Pass one and its windows light up." },
  { name: "course", capture: "store-question", headline: "Courses made of questions", line: "Say what you want to learn. The next questions follow how you answer." },
  { name: "library", capture: "store-library-path", headline: "Or start from the library", line: "Ready-made courses, in study order." },
  // The streak sheet, not the You tab: You also shows the account's name and the phone's time zone.
  // On Android the sheet sits at the bottom of the screen, so that picture is a `lower` one.
  { name: "weeks", capture: "streak-sheet", headline: "See your streak grow", line: "A lit window for every day you study.", lower: { android: true } },
  { name: "building", capture: "store-building", headline: "Make each building yours", line: "Pick its shape, material, roof and trim." },
];
