const heroImage =
  "https://i.postimg.cc/Y2bLKkdC/E49A4767-F207-4D3C-9CE7-226129385659.png"
const sharedImage =
  "https://i.postimg.cc/DyrDyj4j/OGimage.png"

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
      "base"
    ],
    heroImageUrl: heroImage,
    tagline: "The Cheesiest Way to Win.",
    ogTitle: "Pizza Party - Daily Jackpots",
    ogDescription: "Enter the Base Pizza Party with PIZZA, collect toppings, and win one of eight daily slices.",
    ogImageUrl: sharedImage,
    castShareUrl: "https://pizza-party-game.vmfcoin.com/share"
  },
  accountAssociation: {
    header: "eyJmaWQiOjEwMTM0OTEsInR5cGUiOiJhdXRoIiwia2V5IjoiMHgyNTdDYmU4OTk2ODQ5NUMzYUU4QzgxQmNjQjhCRTdmMjU3Q0Q1ZjY2In0",
    payload: "eyJkb21haW4iOiJwaXp6YS1wYXJ0eS1nYW1lLnZtZmNvaW4uY29tIn0",
    signature: "V0PhSzCRcvgFOQjQ5+XvU+DKzsYBvpr3typ5jlkmb/IJSZQNQhxbCbmTYZsXs+cyw42a1wS2Cnxx4U610J8s4Rw="
  },
  baseBuilder: {
    ownerAddress: "0x12e31f706010AE0996A2D8247c432d9102e3c871"
  }
}

export async function GET() {
  return Response.json(manifest)
}
