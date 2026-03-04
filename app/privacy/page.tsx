import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white p-6">
      <div className="max-w-2xl mx-auto" style={{ fontFamily: 'system-ui, sans-serif', fontSize: '14px', lineHeight: 1.6, color: '#000' }}>
        <Link href="/" className="inline-block mb-6 text-blue-600 hover:underline" style={{ fontSize: '14px' }}>
          ← Back to Pizza Party
        </Link>

        <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '0.5rem' }}>Pizza Party Privacy Policy</h1>
        <p style={{ marginBottom: '0.5rem', color: '#444' }}>Effective Date: March 2026</p>
        <p style={{ marginBottom: '1.5rem', color: '#444' }}>Applies To: Pizza Party web app, Farcaster MiniApp, and related services.</p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>1) Overview</h2>
        <p style={{ marginBottom: '1rem' }}>
          Pizza Party is a web app and Farcaster MiniApp built on Base. Many actions (entries, settlements, transfers) happen on-chain and are publicly visible by nature of blockchain technology. We also use limited off-chain systems to improve performance (e.g., caching on-chain state for leaderboards and profiles).
        </p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>2) Information We Collect</h2>

        <h3 style={{ fontSize: '15px', fontWeight: 600, marginTop: '1rem', marginBottom: '0.25rem' }}>A. Information You Provide</h3>
        <ul style={{ marginLeft: '1.5rem', marginBottom: '0.5rem' }}>
          <li>Support messages you send us (e.g., emails, forms, or help requests)</li>
          <li>Any information you submit when contacting us (e.g., username, details of an issue)</li>
        </ul>

        <h3 style={{ fontSize: '15px', fontWeight: 600, marginTop: '1rem', marginBottom: '0.25rem' }}>B. Information Collected Automatically</h3>
        <p style={{ marginBottom: '0.5rem' }}>
          When you use Pizza Party, we may collect:
        </p>
        <ul style={{ marginLeft: '1.5rem', marginBottom: '0.5rem' }}>
          <li>Wallet address(es) you connect</li>
          <li>Farcaster identifiers and public profile data (e.g., username, display name, profile picture) when available through the Farcaster ecosystem</li>
          <li>Gameplay-related activity (entries, claims, spins, staking interactions) which may be stored on-chain and/or cached off-chain for performance</li>
          <li>Device and usage data such as IP address (or hashed IP), device/browser info, timestamps, pages/screens viewed, and crash logs</li>
          <li>Approximate location inferred from IP (coarse, not precise) for security/abuse prevention</li>
        </ul>

        <h3 style={{ fontSize: '15px', fontWeight: 600, marginTop: '1rem', marginBottom: '0.25rem' }}>C. On-Chain Data (Public by Design)</h3>
        <p style={{ marginBottom: '1rem' }}>
          Transactions on Base (e.g., entries, token transfers, staking actions) are publicly accessible on blockchain explorers. We do not control blockchain networks and cannot delete on-chain data.
        </p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>3) How We Use Information</h2>
        <p style={{ marginBottom: '0.5rem' }}>
          We use collected information to:
        </p>
        <ul style={{ marginLeft: '1.5rem', marginBottom: '1rem' }}>
          <li>Provide the game and its features (entries, settlement visibility, claims, staking views)</li>
          <li>Show leaderboards, profiles, and gameplay status</li>
          <li>Verify Farcaster identity for app access (where applicable)</li>
          <li>Prevent fraud, abuse, and rule violations (e.g., enforcing slice rules, detecting suspicious behavior)</li>
          <li>Operate automated settlement processes and system monitoring</li>
          <li>Provide customer support and respond to inquiries</li>
          <li>Improve performance and reliability (e.g., caching on-chain data for faster loading)</li>
        </ul>

        <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>4) Cookies and Similar Technologies</h2>
        <p style={{ marginBottom: '0.5rem' }}>
          We may use cookies or similar technologies to:
        </p>
        <ul style={{ marginLeft: '1.5rem', marginBottom: '0.5rem' }}>
          <li>Maintain sessions</li>
          <li>Remember preferences</li>
          <li>Improve app performance and analytics</li>
        </ul>
        <p style={{ marginBottom: '1rem' }}>
          You can often control cookies through your browser settings, but some features may not work properly if cookies are disabled.
        </p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>5) Sharing and Disclosure</h2>
        <p style={{ marginBottom: '0.5rem' }}>
          We may share information:
        </p>
        <ul style={{ marginLeft: '1.5rem', marginBottom: '0.5rem' }}>
          <li>With service providers that help us operate Pizza Party (hosting, databases, caching, analytics, notifications, blockchain infrastructure). They are permitted to use data only to provide services to us.</li>
          <li>With blockchain networks as part of normal operation (transactions you sign are broadcast to the network).</li>
          <li>For legal, safety, and security reasons if we believe disclosure is necessary to comply with valid requests, enforce policies, protect users, or prevent harm.</li>
          <li>In a business transfer (e.g., merger or acquisition), where user data may be transferred as part of the transaction.</li>
        </ul>
        <p style={{ marginBottom: '1rem' }}>
          We do not sell personal information as a business model.
        </p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>6) Third-Party Services and Links</h2>
        <p style={{ marginBottom: '1rem' }}>
          Pizza Party relies on third-party infrastructure to function (e.g., blockchain RPC providers, Farcaster services, price data providers, and social/profile APIs). Those third parties may collect data under their own policies. We encourage you to review their privacy terms.
        </p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>7) Data Retention</h2>
        <p style={{ marginBottom: '0.5rem' }}>
          We retain information only as long as reasonably necessary for:
        </p>
        <ul style={{ marginLeft: '1.5rem', marginBottom: '0.5rem' }}>
          <li>Operating the service</li>
          <li>Security and abuse prevention</li>
          <li>Legal and compliance needs</li>
        </ul>
        <p style={{ marginBottom: '1rem' }}>
          Because on-chain data is public and persistent, blockchain transactions cannot be removed by us.
        </p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>8) Security</h2>
        <p style={{ marginBottom: '1rem' }}>
          We take reasonable measures to protect information, including access controls and standard security practices. However, no system is 100% secure, and we cannot guarantee absolute security.
        </p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>9) Your Choices</h2>
        <p style={{ marginBottom: '0.5rem' }}>
          Depending on how you use Pizza Party:
        </p>
        <ul style={{ marginLeft: '1.5rem', marginBottom: '0.5rem' }}>
          <li>You can disconnect your wallet at any time through your wallet provider.</li>
          <li>You can limit certain data collection via device/browser settings (e.g., cookies).</li>
          <li>If you contact us, you may request access, correction, or deletion of off-chain account/support data where feasible (subject to security and legal limitations). On-chain data cannot be deleted.</li>
        </ul>

        <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>10) Children&apos;s Privacy</h2>
        <p style={{ marginBottom: '1rem' }}>
          Pizza Party is not intended for children. We do not knowingly collect personal information from children.
        </p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>11) Changes to This Policy</h2>
        <p style={{ marginBottom: '1rem' }}>
          We may update this Privacy Policy from time to time. The &quot;Effective Date&quot; will be updated when changes are posted.
        </p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>12) Contact</h2>
        <p style={{ marginBottom: '0.5rem' }}>
          For privacy questions or requests, contact:
        </p>
        <p style={{ marginBottom: '0.5rem' }}>
          Email: vmf@vmfcoin.com
        </p>
        <p style={{ marginBottom: '2rem' }}>
          Project: Pizza Party / VMF
        </p>

        <Link href="/" className="inline-block text-blue-600 hover:underline" style={{ fontSize: '14px' }}>
          ← Back to Pizza Party
        </Link>
      </div>
    </main>
  )
}
