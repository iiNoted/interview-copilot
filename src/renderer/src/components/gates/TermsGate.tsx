import { useState, useEffect } from 'react'
import { useProductTheme } from '../../App'

const TERMS_VERSION = '1.0'

interface TermsGateProps {
  children: React.ReactNode
}

export function TermsGate({ children }: TermsGateProps): React.JSX.Element {
  const theme = useProductTheme()
  const appName = theme.name
  const [accepted, setAccepted] = useState<boolean | null>(null)
  const [scrolledToBottom, setScrolledToBottom] = useState(false)

  useEffect(() => {
    window.api.getTermsAccepted().then(setAccepted)
  }, [])

  async function handleAccept(): Promise<void> {
    await window.api.acceptTerms()
    setAccepted(true)
  }

  function handleScroll(e: React.UIEvent<HTMLDivElement>): void {
    const el = e.currentTarget
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) {
      setScrolledToBottom(true)
    }
  }

  if (accepted === null) return <div />
  if (accepted) return <>{children}</>

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--gate-bg,#0a0e14)]">
      <div className="w-full max-w-lg mx-4 flex flex-col rounded-[var(--radius-base,12px)] border border-white/10 bg-[var(--color-bg-card,hsl(220,20%,10%))] shadow-2xl overflow-hidden" style={{ maxHeight: '80vh' }}>
        <div className="px-6 py-4 border-b border-white/5">
          <h1 className="text-lg font-semibold text-white">Terms of Service & Privacy Policy</h1>
          <p className="text-xs text-white/40 mt-1">v{TERMS_VERSION} by SourceThread</p>
        </div>

        <div
          className="flex-1 overflow-y-auto px-6 py-4 text-xs text-white/70 leading-relaxed space-y-4"
          style={{ maxHeight: '50vh' }}
          onScroll={handleScroll}
        >
          <p className="text-white/90 font-medium">Please read these terms carefully before using {appName}.</p>

          <section>
            <h2 className="text-white/80 font-semibold mb-1">1. Acceptance of Terms</h2>
            <p>By installing, accessing, or using {appName} ("the Software"), you agree to be bound by these Terms of Service ("Terms") and our Privacy Policy. If you do not agree, you must immediately uninstall the Software and cease all use. These Terms constitute a legally binding agreement between you ("User") and SourceThread ("Company", "we", "us").</p>
          </section>

          <section>
            <h2 className="text-white/80 font-semibold mb-1">2. License Grant</h2>
            <p>We grant you a limited, non-exclusive, non-transferable, revocable license to use the Software for personal and professional purposes, subject to these Terms. You may not: (a) copy, modify, distribute, sell, or lease any part of the Software or its content; (b) reverse engineer, decompile, disassemble, or attempt to extract the source code; (c) remove, alter, or obscure any proprietary notices; (d) use the Software to build a competing product or service; (e) sublicense, rent, or lend the Software to third parties; (f) use automated tools to scrape, extract, or harvest content or data from the Software.</p>
          </section>

          <section>
            <h2 className="text-white/80 font-semibold mb-1">3. Intellectual Property</h2>
            <p>All content, articles, knowledge base materials, algorithms, prompts, coaching logic, UI designs, and software code within {appName} are the exclusive property of SourceThread and are protected by copyright, trade secret, and other intellectual property laws. The knowledge base articles, qualification data, coaching prompts, and AI response templates are proprietary trade secrets. Unauthorized reproduction, distribution, or use of any content constitutes infringement and may result in civil and criminal penalties.</p>
          </section>

          <section>
            <h2 className="text-white/80 font-semibold mb-1">4. Privacy & Data Collection</h2>
            <p>Audio transcription is processed locally on your device. We do not record, store, or transmit your audio. AI coaching requests are sent to third-party AI providers (OpenAI) using your API key or our managed service. We collect: (a) email address for account management; (b) subscription status for billing; (c) anonymous usage analytics (feature usage, error rates). We do NOT collect: interview content, transcripts, resumes, job descriptions, or any personally identifiable conversation data. The Remote View feature operates on your local network only; no data passes through our servers.</p>
          </section>

          <section>
            <h2 className="text-white/80 font-semibold mb-1">5. Subscription & Billing</h2>
            <p>Paid features require an active subscription managed through Stripe. Subscriptions auto-renew unless cancelled. Refunds are provided at our sole discretion. We reserve the right to modify pricing with 30 days notice. Chargebacks or fraudulent disputes will result in immediate account termination and permanent ban from all SourceThread services.</p>
          </section>

          <section>
            <h2 className="text-white/80 font-semibold mb-1">6. Acceptable Use</h2>
            <p>You agree not to: (a) use the Software for any illegal purpose; (b) attempt to gain unauthorized access to our systems or other users' accounts; (c) interfere with or disrupt the Software's functionality; (d) share your account credentials or API keys with others; (e) use the Software to misrepresent your qualifications or deceive employers; (f) redistribute, republish, or commercially exploit the knowledge base content.</p>
          </section>

          <section>
            <h2 className="text-white/80 font-semibold mb-1">7. Disclaimer of Warranties</h2>
            <p>THE SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT GUARANTEE THAT THE SOFTWARE WILL BE ERROR-FREE, UNINTERRUPTED, OR THAT DEFECTS WILL BE CORRECTED. AI-GENERATED COACHING RESPONSES MAY CONTAIN INACCURACIES. YOU USE THE SOFTWARE AT YOUR OWN RISK. WE MAKE NO GUARANTEES REGARDING INTERVIEW OUTCOMES, EMPLOYMENT, OR CAREER ADVANCEMENT.</p>
          </section>

          <section>
            <h2 className="text-white/80 font-semibold mb-1">8. Limitation of Liability</h2>
            <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, SOURCETHREAD SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING FROM: (A) YOUR USE OR INABILITY TO USE THE SOFTWARE; (B) ANY CONDUCT OR CONTENT OF THIRD PARTIES; (C) UNAUTHORIZED ACCESS TO YOUR DATA; (D) RELIANCE ON AI-GENERATED CONTENT. OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT PAID BY YOU IN THE 12 MONTHS PRECEDING THE CLAIM.</p>
          </section>

          <section>
            <h2 className="text-white/80 font-semibold mb-1">9. Indemnification</h2>
            <p>You agree to indemnify, defend, and hold harmless SourceThread, its officers, directors, employees, and agents from any claims, damages, losses, liabilities, and expenses (including attorneys' fees) arising from: (a) your use of the Software; (b) your violation of these Terms; (c) your violation of any third party's rights; (d) any content you submit through the Software.</p>
          </section>

          <section>
            <h2 className="text-white/80 font-semibold mb-1">10. Termination</h2>
            <p>We may suspend or terminate your access at any time, with or without cause, with or without notice. Upon termination, your license to use the Software immediately ceases. Sections 3, 7, 8, 9, 11, and 12 survive termination.</p>
          </section>

          <section>
            <h2 className="text-white/80 font-semibold mb-1">11. Governing Law & Dispute Resolution</h2>
            <p>These Terms are governed by the laws of the State of Texas, United States, without regard to conflict of law principles. Any disputes shall be resolved through binding arbitration administered by the American Arbitration Association in Houston, Texas. You waive any right to participate in class action lawsuits or class-wide arbitration against SourceThread.</p>
          </section>

          <section>
            <h2 className="text-white/80 font-semibold mb-1">12. General</h2>
            <p>These Terms constitute the entire agreement between you and SourceThread regarding the Software. If any provision is found unenforceable, the remaining provisions remain in full force. Our failure to enforce any right does not waive that right. We may update these Terms at any time; continued use after changes constitutes acceptance. We may assign our rights under these Terms without restriction.</p>
          </section>

          <p className="text-white/40 pt-2">Last updated: March 2026. SourceThread, Houston, TX.</p>
        </div>

        <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between">
          <p className="text-[10px] text-white/30">
            {scrolledToBottom ? 'You have read the terms' : 'Scroll to read all terms'}
          </p>
          <button
            disabled={!scrolledToBottom}
            onClick={handleAccept}
            className={`px-6 py-2 rounded-[var(--radius-base,8px)] text-sm font-medium transition-all ${
              scrolledToBottom
                ? 'bg-[var(--color-primary,hsl(217,91%,60%))] text-[var(--color-primary-fg,white)] hover:brightness-110 cursor-pointer'
                : 'bg-white/5 text-white/20 cursor-not-allowed'
            }`}
          >
            I Accept
          </button>
        </div>
      </div>
    </div>
  )
}
