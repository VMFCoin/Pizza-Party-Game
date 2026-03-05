const heroImage =
  "https://i.postimg.cc/Y2bLKkdC/E49A4767-F207-4D3C-9CE7-226129385659.png"
const sharedImage =
  "https://i.postimg.cc/nrktq50x/New_Pizza_Party_Share_Image.png"

const manifest = {
  frame: {
    name: "Pizza Party",
    version: "1",
    iconUrl: heroImage,
    homeUrl: "https://pizza-party-game.vmfcoin.com/",
    imageUrl: sharedImage,
    buttonTitle: "Play Pizza Party",
    splashImageUrl: heroImage,
    splashBackgroundColor: "#dc2626",
    webhookUrl: "https://pizza-party-game.vmfcoin.com/api/farcaster/webhook",
    subtitle: "Daily Cheesy Winners",
    description: "A daily party with friends. Play every day, collect toppings, stake PIZZA, and Spin the Pie for hot jackpots.",
    screenshotUrls: [
      sharedImage
    ],
    primaryCategory: "games",
    tags: [
      "pizza",
      "jackpot",
      "game",
      "base",
      "veterans"
    ],
    heroImageUrl: sharedImage,
    tagline: "The Cheesiest Way to Win.",
    ogTitle: "Pizza Party - Daily Jackpots",
    ogDescription: "Enter Pizza Party, win, stake, spin, and more!",
    ogImageUrl: sharedImage,
    castShareUrl: "https://pizza-party-game.vmfcoin.com",
  },
  accountAssociation: {
    header: "eyJmaWQiOjEwMTM0OTEsInR5cGUiOiJhdXRoIiwia2V5IjoiMHgyNTdDYmU4OTk2ODQ5NUMzYUU4QzgxQmNjQjhCRTdmMjU3Q0Q1ZjY2In0",
    payload: "eyJkb21haW4iOiJwaXp6YS1wYXJ0eS1nYW1lLnZtZmNvaW4uY29tIn0",
    signature: "V0PhSzCRcvgFOQjQ5+XvU+DKzsYBvpr3typ5jlkmb/IJSZQNQhxbCbmTYZsXs+cyw42a1wS2Cnxx4U610J8s4Rw="
  },
}

export async function GET() {
  return Response.json(manifest)
}
