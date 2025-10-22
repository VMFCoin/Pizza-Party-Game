export async function GET() {
  return Response.json({
    accountAssociation: {
      header: "eyJmaWQiOjEwMTM0OTEsInR5cGUiOiJhdXRoIiwia2V5IjoiMHgyNTdDYmU4OTk2ODQ5NUMzYUU4QzgxQmNjQjhCRTdmMjU3Q0Q1ZjY2In0",
      payload: "eyJkb21haW4iOiJwaXp6YS1wYXJ0eS52bWZjb2luLmNvbSJ9",
      signature: "1YqIWG3Oj6ANiMzwA+qHepr3BLWQcJg7jH/LLdsdGF5pj4TokK/8b/2ggA/l9GeB6fLCHSzROp8QKbPPb1gT2hs="
    },
    miniapp: {
      version: "1",
      name: "Pizza Party",
      homeUrl: "https://pizza-party.vmfcoin.com",
      iconUrl: "https://u.cubeupload.com/vmfcoin/E49A4767F2074D3C9CE7.png",
      imageUrl: "https://u.cubeupload.com/vmfcoin/E49A4767F2074D3C9CE7.png",
      buttonTitle: "Play Pizza Party",
      subtitle: "8 slices • 8 winners!",
      description: "Join the daily Pizza Party on Base. Spend 1 VMF to enter, collect toppings, and win gooey jackpots with friends.",
      tagline: "Daily Cheesy Jackpots",
      primaryCategory: "games",
      tags: ["pizza", "vmf", "jackpot", "game", "base"],
      heroImageUrl: "https://pizza-party.vmfcoin.com/images/rotated-90-pizza-wallpaper.png",
      splashImageUrl: "https://u.cubeupload.com/vmfcoin/E49A4767F2074D3C9CE7.png",
      splashBackgroundColor: "#dc2626",
      screenshotUrls: [
        "https://pizza-party.vmfcoin.com/images/screenshots/daily-card.png",
        "https://pizza-party.vmfcoin.com/images/screenshots/invite-modal.png"
      ],
      ogTitle: "Pizza Party Daily Jackpots",
      ogDescription: "Enter the Base Pizza Party for 1 VMF, collect toppings, and win one of eight daily slices.",
      ogImageUrl: "https://u.cubeupload.com/vmfcoin/E49A4767F2074D3C9CE7.png",
      castShareUrl: "https://pizza-party.vmfcoin.com/share",
      webhookUrl: "https://pizza-party.vmfcoin.com/api/miniapp-webhook"
    }
  });
}
