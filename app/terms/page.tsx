import Link from 'next/link'

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white p-6">
      <div className="max-w-2xl mx-auto" style={{ fontFamily: 'system-ui, sans-serif', fontSize: '14px', lineHeight: 1.6, color: '#000' }}>
        <Link href="/" className="inline-block mb-6 text-blue-600 hover:underline" style={{ fontSize: '14px' }}>
          ← Back to Pizza Party
        </Link>

        <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '0.5rem' }}>Pizza Party Terms of Service</h1>
        <p style={{ marginBottom: '1.5rem', color: '#444' }}>Effective Date: March 2026</p>

        <p style={{ marginBottom: '1rem' }}>
          These Terms of Service (&quot;Terms&quot;) govern your access to and use of the Pizza Party website, Farcaster MiniApp, smart contracts, software, and related services (collectively, the &quot;Service&quot;).
        </p>
        <p style={{ marginBottom: '1rem' }}>
          By accessing or using the Service, you agree to be legally bound by these Terms.
        </p>
        <p style={{ marginBottom: '2rem' }}>
          If you do not agree, do not access or use the Service.
        </p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>1. Acceptance of Risk and Blockchain Acknowledgment</h2>
        <p style={{ marginBottom: '0.5rem' }}>
          Pizza Party operates entirely or partially through smart contracts deployed on a public blockchain network.
        </p>
        <p style={{ marginBottom: '0.5rem' }}>
          By using the Service, you acknowledge and agree that:
        </p>
        <ul style={{ marginLeft: '1.5rem', marginBottom: '1rem' }}>
          <li>Blockchain transactions are irreversible and final.</li>
          <li>Digital assets may lose value, including total loss.</li>
          <li>Smart contracts may contain bugs, vulnerabilities, or unforeseen logic errors.</li>
          <li>Price feeds, oracle inputs, and external APIs may fail or provide inaccurate data.</li>
          <li>Network congestion, forks, reorganizations, or outages may occur.</li>
          <li>Wallet providers and RPC providers are third-party services beyond our control.</li>
          <li>You are solely responsible for managing your wallet, private keys, and security.</li>
          <li>You assume all risks associated with blockchain participation.</li>
        </ul>

        <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>2. No Investment, Financial, or Fiduciary Relationship</h2>
        <p style={{ marginBottom: '0.5rem' }}>
          $PIZZA is a utility token designed for use within the Pizza Party ecosystem.
        </p>
        <p style={{ marginBottom: '0.5rem' }}>
          Pizza Party:
        </p>
        <ul style={{ marginLeft: '1.5rem', marginBottom: '0.5rem' }}>
          <li>Does not provide investment advice.</li>
          <li>Does not provide financial advice.</li>
          <li>Does not provide legal advice.</li>
          <li>Does not act as a broker, dealer, exchange, custodian, or fiduciary.</li>
          <li>Does not manage assets on your behalf.</li>
        </ul>
        <p style={{ marginBottom: '1rem' }}>
          Nothing in the Service constitutes a recommendation to purchase, sell, or hold digital assets.
        </p>
        <p style={{ marginBottom: '1rem' }}>
          You understand that participation is voluntary and at your own risk.
        </p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>3. Eligibility and Legal Compliance</h2>
        <p style={{ marginBottom: '0.5rem' }}>
          You represent and warrant that:
        </p>
        <ul style={{ marginLeft: '1.5rem', marginBottom: '0.5rem' }}>
          <li>You are at least 18 years old or the age of majority in your jurisdiction.</li>
          <li>You are legally permitted to use digital assets and blockchain applications.</li>
          <li>You are not subject to sanctions or trade restrictions.</li>
          <li>Your participation does not violate any applicable law.</li>
        </ul>
        <p style={{ marginBottom: '1rem' }}>
          You are solely responsible for determining the legality of your use of the Service.
        </p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>4. No Custody and No Control of Funds</h2>
        <p style={{ marginBottom: '0.5rem' }}>
          Pizza Party does not take custody of user funds.
        </p>
        <p style={{ marginBottom: '0.5rem' }}>
          All transactions occur directly between your wallet and smart contracts deployed on the blockchain. We cannot access, freeze, reverse, or recover your tokens.
        </p>
        <p style={{ marginBottom: '1rem' }}>
          Loss of private keys or wallet access may result in permanent loss of assets.
        </p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>5. Game Mechanics and No Guarantees</h2>
        <p style={{ marginBottom: '0.5rem' }}>
          Daily games, weekly jackpots, staking rewards, Spin the Pie outcomes, parlor fees, and all other reward mechanics are determined solely by smart contract logic.
        </p>
        <p style={{ marginBottom: '0.5rem' }}>
          We do not guarantee:
        </p>
        <ul style={{ marginLeft: '1.5rem', marginBottom: '0.5rem' }}>
          <li>Profitability</li>
          <li>Reward frequency</li>
          <li>Jackpot occurrence</li>
          <li>Token value stability</li>
          <li>Continued availability of features</li>
        </ul>
        <p style={{ marginBottom: '1rem' }}>
          All features are subject to modification, suspension, or discontinuation.
        </p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>6. Upgrades and Smart Contract Modifications</h2>
        <p style={{ marginBottom: '0.5rem' }}>
          Pizza Party uses upgradeable smart contracts (UUPS architecture).
        </p>
        <p style={{ marginBottom: '0.5rem' }}>
          You acknowledge that:
        </p>
        <ul style={{ marginLeft: '1.5rem', marginBottom: '0.5rem' }}>
          <li>Contract logic may be upgraded by the contract owner.</li>
          <li>Upgrades may modify functionality.</li>
          <li>Bugs may be fixed or features added without prior notice.</li>
          <li>You accept the risk associated with upgradeable contract systems.</li>
        </ul>

        <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>7. Prohibited Conduct</h2>
        <p style={{ marginBottom: '0.5rem' }}>
          You agree not to:
        </p>
        <ul style={{ marginLeft: '1.5rem', marginBottom: '0.5rem' }}>
          <li>Exploit vulnerabilities.</li>
          <li>Manipulate gameplay.</li>
          <li>Circumvent entry limits.</li>
          <li>Use automation to gain unfair advantage.</li>
          <li>Interfere with settlement processes.</li>
          <li>Attempt unauthorized access to infrastructure.</li>
        </ul>
        <p style={{ marginBottom: '1rem' }}>
          We reserve the right to block wallets, restrict access, or modify participation rights at our discretion.
        </p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>8. Charitable Allocations</h2>
        <p style={{ marginBottom: '0.5rem' }}>
          Charitable transfers are executed programmatically via smart contracts.
        </p>
        <p style={{ marginBottom: '0.5rem' }}>
          Pizza Party does not guarantee:
        </p>
        <ul style={{ marginLeft: '1.5rem', marginBottom: '0.5rem' }}>
          <li>Tax treatment of charitable allocations.</li>
          <li>Use of funds by third-party charities.</li>
          <li>Ongoing inclusion of any specific charity wallet.</li>
        </ul>
        <p style={{ marginBottom: '1rem' }}>
          No fiduciary or trust relationship is created between you and any charitable organization.
        </p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>9. Intellectual Property</h2>
        <p style={{ marginBottom: '1rem' }}>
          All content, branding, design, documentation, and proprietary software associated with Pizza Party is owned by or licensed to the project.
        </p>
        <p style={{ marginBottom: '1rem' }}>
          Unauthorized use is prohibited.
        </p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>10. Disclaimer of Warranties</h2>
        <p style={{ marginBottom: '0.5rem' }}>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND.
        </p>
        <p style={{ marginBottom: '0.5rem' }}>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, INCLUDING:
        </p>
        <ul style={{ marginLeft: '1.5rem', marginBottom: '0.5rem' }}>
          <li>MERCHANTABILITY</li>
          <li>FITNESS FOR A PARTICULAR PURPOSE</li>
          <li>NON-INFRINGEMENT</li>
          <li>ACCURACY OR RELIABILITY</li>
        </ul>
        <p style={{ marginBottom: '1rem' }}>
          We do not guarantee uninterrupted or error-free operation.
        </p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>11. Limitation of Liability</h2>
        <p style={{ marginBottom: '0.5rem' }}>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW:
        </p>
        <p style={{ marginBottom: '0.5rem' }}>
          IN NO EVENT SHALL PIZZA PARTY, ITS OPERATORS, CONTRIBUTORS, AFFILIATES, OR SERVICE PROVIDERS BE LIABLE FOR:
        </p>
        <ul style={{ marginLeft: '1.5rem', marginBottom: '0.5rem' }}>
          <li>LOSS OF DIGITAL ASSETS</li>
          <li>LOST PROFITS</li>
          <li>INDIRECT OR CONSEQUENTIAL DAMAGES</li>
          <li>DATA LOSS</li>
          <li>NETWORK FAILURES</li>
          <li>PRICE VOLATILITY</li>
          <li>SMART CONTRACT BUGS</li>
        </ul>
        <p style={{ marginBottom: '1rem' }}>
          OUR TOTAL LIABILITY SHALL NOT EXCEED ONE HUNDRED U.S. DOLLARS ($100).
        </p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>12. Indemnification</h2>
        <p style={{ marginBottom: '0.5rem' }}>
          You agree to indemnify and hold harmless Pizza Party and its affiliates from any claims, damages, liabilities, costs, and expenses arising from:
        </p>
        <ul style={{ marginLeft: '1.5rem', marginBottom: '1rem' }}>
          <li>Your use of the Service</li>
          <li>Your violation of these Terms</li>
          <li>Your violation of any applicable law</li>
          <li>Your infringement of third-party rights</li>
        </ul>

        <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>13. Arbitration Agreement</h2>
        <p style={{ marginBottom: '0.5rem' }}>
          Any dispute arising out of or relating to these Terms or the Service shall be resolved through binding arbitration on an individual basis.
        </p>
        <p style={{ marginBottom: '0.5rem' }}>
          You agree:
        </p>
        <ul style={{ marginLeft: '1.5rem', marginBottom: '0.5rem' }}>
          <li>To waive any right to a jury trial.</li>
          <li>To waive any right to participate in a class action lawsuit or class arbitration.</li>
          <li>That arbitration will be the exclusive method of dispute resolution.</li>
        </ul>
        <p style={{ marginBottom: '1rem' }}>
          Arbitration shall be conducted in the United States in a location determined by the Service operator.
        </p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>14. Class Action Waiver</h2>
        <p style={{ marginBottom: '1rem' }}>
          YOU AGREE THAT ANY CLAIMS SHALL BE BROUGHT ONLY IN YOUR INDIVIDUAL CAPACITY AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY CLASS OR REPRESENTATIVE ACTION.
        </p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>15. Governing Law</h2>
        <p style={{ marginBottom: '1rem' }}>
          These Terms are governed by the laws of the United States, without regard to conflict-of-law principles.
        </p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>16. Termination</h2>
        <p style={{ marginBottom: '0.5rem' }}>
          We reserve the right to suspend or terminate access at any time without liability.
        </p>
        <p style={{ marginBottom: '1rem' }}>
          Termination does not affect blockchain transactions already executed.
        </p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>17. Changes to Terms</h2>
        <p style={{ marginBottom: '1rem' }}>
          We may modify these Terms at any time. Continued use of the Service after updates constitutes acceptance of the revised Terms.
        </p>

        <h2 style={{ fontSize: '16px', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>18. Contact</h2>
        <p style={{ marginBottom: '0.5rem' }}>
          For legal inquiries:
        </p>
        <p style={{ marginBottom: '0.5rem' }}>
          vmf@vmfcoin.com
        </p>
        <p style={{ marginBottom: '2rem' }}>
          Pizza Party / VMF
        </p>

        <Link href="/" className="inline-block text-blue-600 hover:underline" style={{ fontSize: '14px' }}>
          ← Back to Pizza Party
        </Link>
      </div>
    </main>
  )
}
