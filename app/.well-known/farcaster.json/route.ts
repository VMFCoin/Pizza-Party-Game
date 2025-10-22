const manifest = {
  accountAssociation: {
    header: "eyJmaWQiOjEwMTM0OTEsInR5cGUiOiJhdXRoIiwia2V5IjoiMHgyNTdDYmU4OTk2ODQ5NUMzYUU4QzgxQmNjQjhCRTdmMjU3Q0Q1ZjY2In0",
    payload: "eyJkb21haW4iOiJwaXp6YS1wYXJ0eS1nYW1lLnZtZmNvaW4uY29tIn0",
    signature: "V0PhSzCRcvgFOQjQ5+XvU+DKzsYBvpr3typ5jlkmb/IJSZQNQhxbCbmTYZsXs+cyw42a1wS2Cnxx4U610J8s4Rw="
  },
  miniapp: {
    version: "1",
    name: "Pizza Party",
    homeUrl: "https://pizza-party-game.vmfcoin.com",
    iconUrl: "https://u.cubeupload.com/vmfcoin/E49A4767F2074D3C9CE7.png",
    imageUrl: "https://u.cubeupload.com/vmfcoin/E49A4767F2074D3C9CE7.png",
    buttonTitle: "Play Pizza Party",
    subtitle: "8 slices • 8 winners!",
    description: "Join the daily Pizza Party on Base. Spend 1 VMF to enter, collect toppings, and win gooey jackpots with friends.",
    tagline: "The Cheesiest Way to Win.",
    primaryCategory: "games",
    tags: ["pizza", "vmf", "jackpot", "game", "base"],
    heroImageUrl: "https://pizza-party-game.vmfcoin.com/images/screenshots/daily-card.png",
    splashImageUrl: "https://u.cubeupload.com/vmfcoin/E49A4767F2074D3C9CE7.png",
    splashBackgroundColor: "#dc2626",
    screenshotUrls: [
      "https://pizza-party-game.vmfcoin.com/images/screenshots/daily-card.png"
    ],
    ogTitle: "Pizza Party- Daily Jackpots",
    ogDescription: "Enter the Base Pizza Party with VMF, collect toppings, and win one of eight daily slices.",
    ogImageUrl: "https://u.cubeupload.com/vmfcoin/E49A4767F2074D3C9CE7.png",
    castShareUrl: "https://pizza-party-game.vmfcoin.com/share",
    webhookUrl: "https://pizza-party-game.vmfcoin.com/api/webhook"
  },
  frame: {
    name: "Pizza Party",
    version: "1",
    homeUrl: "https://pizza-party-game.vmfcoin.com",
    iconUrl: "https://u.cubeupload.com/vmfcoin/E49A4767F2074D3C9CE7.png",
    imageUrl: "https://u.cubeupload.com/vmfcoin/E49A4767F2074D3C9CE7.png",
    buttonTitle: "Play Pizza Party",
    subtitle: "8 slices • 8 winners!",
    description: "Join the daily Pizza Party on Base. Spend 1 VMF to enter, collect toppings, and win gooey jackpots with friends.",
    tagline: "The Cheesiest Way to Win.",
    primaryCategory: "games",
    tags: ["pizza", "vmf", "jackpot", "game", "base"],
    splashImageUrl: "https://u.cubeupload.com/vmfcoin/E49A4767F2074D3C9CE7.png",
    splashBackgroundColor: "#dc2626",
    screenshotUrls: [
      "https://pizza-party-game.vmfcoin.com/images/screenshots/daily-card.png"
    ],
    ogTitle: "Pizza Party - Daily Jackpots",
    ogDescription: "Enter the Base Pizza Party with VMF, collect toppings, and win one of eight daily slices.",
    ogImageUrl: "https://u.cubeupload.com/vmfcoin/E49A4767F2074D3C9CE7.png",
    castShareUrl: "https://pizza-party-game.vmfcoin.com/share",
    webhookUrl: "https://pizza-party-game.vmfcoin.com/api/webhook"
  }
}

export async function GET() {
  return Response.json(manifest)
}
