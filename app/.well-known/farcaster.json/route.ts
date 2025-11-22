const sharedImage =
  "https://u.cubeupload.com/vmfcoin/142097AF71F541259315.png"

const manifest = {
  frame: {
    name: "Pizza Party",
    version: "1",
    iconUrl: sharedImage,
    homeUrl: "https://pizza-party-game.vmfcoin.com/",
    imageUrl: sharedImage,
    buttonTitle: "Play Pizza Party",
    splashImageUrl: sharedImage,
    splashBackgroundColor: "#dc2626",
    webhookUrl: sharedImage,
    subtitle: "8 slices • 8 winners!",
    description: "Join the daily Pizza Party on Base. Spend 1 VMF to enter, collect toppings, and win gooey jackpots with friends.",
    screenshotUrls: [
      sharedImage
    ],
    primaryCategory: "games",
    tags: [
      "pizza",
      "vmf",
      "jackpot",
      "game",
      "base"
    ],
    heroImageUrl: sharedImage,
    tagline: "The Cheesiest Way to Win.",
    ogTitle: "Pizza Party - Daily Jackpots",
    ogDescription: "Enter the Base Pizza Party with VMF, collect toppings, and win one of eight daily slices.",
    ogImageUrl: sharedImage,
    castShareUrl: "https://pizza-party-game.vmfcoin.com/share"
  },
  accountAssociation: {
    header: "eyJmaWQiOjEwMTM0OTEsInR5cGUiOiJhdXRoIiwia2V5IjoiMHgyNTdDYmU4OTk2ODQ5NUMzYUU4QzgxQmNjQjhCRTdmMjU3Q0Q1ZjY2In0",
    payload: "eyJkb21haW4iOiJwaXp6YS1wYXJ0eS1nYW1lLnZtZmNvaW4uY29tIn0",
    signature: "V0PhSzCRcvgFOQjQ5+XvU+DKzsYBvpr3typ5jlkmb/IJSZQNQhxbCbmTYZsXs+cyw42a1wS2Cnxx4U610J8s4Rw="
  }
}

export async function GET() {
  return Response.json(manifest)
}
