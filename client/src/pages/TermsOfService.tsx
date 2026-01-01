import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Shield, FileText, AlertTriangle, Scale, UserCheck, Ban,
  Mail, CheckCircle
} from 'lucide-react'
import { useIsMobile } from '../hooks/use-is-mobile';
import { SEO } from '../lib/seo-optimization'
import { MainNavigation } from '../components/MainNavigation'
import MainFooter from '../components/MainFooter'

// Mobile-optimized gradient orbs
const GradientOrb = ({ className, color = 'blue' }: { className?: string, color?: string }) => {
  const isMobile = useIsMobile()
  const colors = {
    blue: isMobile ? 'bg-blue-600/10' : 'from-blue-500/30 via-blue-600/20 to-transparent',
    purple: isMobile ? 'bg-purple-600/10' : 'from-purple-500/30 via-purple-600/20 to-transparent',
  }

  if (isMobile) {
    return <div className={`absolute rounded-full ${colors[color as keyof typeof colors]} ${className}`} style={{ filter: 'blur(40px)' }} />
  }

  return (
    <div className={`absolute rounded-full blur-[100px] bg-gradient-radial ${colors[color as keyof typeof colors]} ${className}`} />
  )
}

// Section Component
const TermsSection = ({ id, icon: Icon, title, children }: { id: string, icon: React.ComponentType<{ className?: string }>, title: string, children: React.ReactNode }) => (
  <motion.section
    id={id}
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-50px" }}
    className="mb-12 scroll-mt-32"
  >
    <div className="flex items-center gap-3 mb-4">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
        <Icon className="w-5 h-5 text-blue-400" />
      </div>
      <h2 className="text-xl md:text-2xl font-bold text-white">{title}</h2>
    </div>
    <div className="prose prose-invert prose-sm max-w-none text-white/70 leading-relaxed space-y-4">
      {children}
    </div>
  </motion.section>
)

const TermsOfService = () => {
  const isMobile = useIsMobile()

  // Table of contents
  const sections = [
    { id: 'acceptance', title: 'Acceptance of Terms' },
    { id: 'description', title: 'Description of Service' },
    { id: 'eligibility', title: 'Eligibility' },
    { id: 'account', title: 'Account Registration' },
    { id: 'usage', title: 'Acceptable Use' },
    { id: 'prohibited', title: 'Prohibited Activities' },
    { id: 'intellectual-property', title: 'Intellectual Property' },
    { id: 'payment', title: 'Payment Terms' },
    { id: 'termination', title: 'Termination' },
    { id: 'disclaimers', title: 'Disclaimers' },
    { id: 'limitation', title: 'Limitation of Liability' },
    { id: 'indemnification', title: 'Indemnification' },
    { id: 'governing-law', title: 'Governing Law' },
    { id: 'changes', title: 'Changes to Terms' },
    { id: 'contact', title: 'Contact Us' },
  ]

  const [activeSection, setActiveSection] = useState(sections[0].id)

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id)
          }
        })
      },
      {
        rootMargin: '-20% 0px -35% 0px',
        threshold: 0.1
      }
    )

    sections.forEach(({ id }) => {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    })

    return () => observer.disconnect()
  }, [])

  return (
    <div className="min-h-screen bg-[#030303] text-white font-sans selection:bg-blue-500/30 relative w-full overflow-x-clip">
      <SEO
        title="Terms of Service - Veefore | User Agreement"
        description="Read the Terms of Service for Veefore. These terms govern your use of our AI-powered engagement automation platform."
      />

      {/* Ambient Background */}
      <div className={`${isMobile ? 'absolute h-[800vh]' : 'fixed'} inset-0 pointer-events-none overflow-hidden -z-10`}>
        <GradientOrb className={`${isMobile ? 'w-[400px] h-[400px]' : 'w-[800px] h-[800px]'} -top-[100px] -left-[100px]`} color="blue" />
        <GradientOrb className={`${isMobile ? 'w-[300px] h-[300px]' : 'w-[600px] h-[600px]'} top-[30%] -right-[100px]`} color="purple" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%221%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22 opacity=%220.03%22/%3E%3C/svg%3E')] opacity-50" />
      </div>

      {/* Navigation */}
      <MainNavigation />

      {/* Hero Section */}
      <section className="relative pt-28 pb-12 md:pt-36 md:pb-16 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm mb-6">
              <Scale className="w-4 h-4 mr-2" />
              Legal Agreement
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-4"
          >
            <span className="text-white">Terms of </span>
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Service
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-base md:text-lg text-white/50 max-w-2xl mx-auto mb-4"
          >
            Please read these terms carefully before using Veefore. By using our services, you agree to be bound by these terms.
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-sm text-white/40"
          >
            Last updated: December 31, 2025
          </motion.p>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-[280px_1fr] gap-8 lg:gap-12">
            {/* Table of Contents - Desktop */}
            <aside className="hidden md:block">
              <div className="sticky top-28 p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">Contents</h3>
                <nav className="space-y-2">
                  {sections.map((section) => (
                    <a
                      key={section.id}
                      href={`#${section.id}`}
                      className={`block text-sm transition-all duration-200 py-1 ${activeSection === section.id
                        ? 'text-purple-400 font-medium border-l-2 border-purple-400 pl-3 -ml-3'
                        : 'text-white/50 hover:text-white'
                        }`}
                    >
                      {section.title}
                    </a>
                  ))}
                </nav>
              </div>
            </aside>

            {/* Terms Content */}
            <div>
              <TermsSection id="acceptance" icon={CheckCircle} title="Acceptance of Terms">
                <p>
                  Welcome to Veefore ("Platform," "Service," "we," "us," or "our"), a product of <strong>Veefed Technologies Private Limited</strong>,
                  a company incorporated under the laws of India with its registered office at South City, Kargaina,
                  Bareilly, Uttar Pradesh - 243001.
                </p>
                <p>
                  By accessing, browsing, or using our website, mobile applications, or any other services provided by Veefore
                  (collectively, the "Services"), you acknowledge that you have read, understood, and agree to be bound by
                  these Terms of Service ("Terms"), along with our Privacy Policy.
                </p>
                <p>
                  If you do not agree to these Terms, you must not access or use our Services. These Terms constitute a
                  legally binding agreement between you and Veefed Technologies Private Limited.
                </p>
              </TermsSection>

              <TermsSection id="description" icon={FileText} title="Description of Service">
                <p>
                  Veefore is an AI-powered engagement automation platform designed to help creators, influencers, and
                  businesses grow their social media presence through intelligent automation tools.
                </p>
                <h4 className="text-white font-semibold mt-6 mb-2">Our Services Include:</h4>
                <ul className="list-disc pl-6 space-y-2">
                  <li>AI-powered comment and DM automation</li>
                  <li>Engagement analytics and insights</li>
                  <li>Content scheduling and management</li>
                  <li>Audience growth tools and strategies</li>
                  <li>Integration with social media platforms</li>
                </ul>
                <p className="mt-4">
                  We reserve the right to modify, suspend, or discontinue any aspect of our Services at any time,
                  with or without notice. We shall not be liable to you or any third party for any modification,
                  suspension, or discontinuation of the Services.
                </p>
              </TermsSection>

              <TermsSection id="eligibility" icon={UserCheck} title="Eligibility">
                <p>To use our Services, you must:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Be at least 18 years of age or the age of majority in your jurisdiction</li>
                  <li>Have the legal capacity to enter into binding contracts</li>
                  <li>Not be prohibited from using our Services under applicable laws</li>
                  <li>Provide accurate and complete registration information</li>
                  <li>Comply with all applicable local, state, national, and international laws</li>
                </ul>
                <p className="mt-4">
                  By using our Services, you represent and warrant that you meet all eligibility requirements.
                  We reserve the right to verify your eligibility at any time.
                </p>
              </TermsSection>

              <TermsSection id="account" icon={UserCheck} title="Account Registration">
                <p>
                  To access certain features of our Services, you may need to create an account.
                  When creating an account, you agree to:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Provide accurate, current, and complete information</li>
                  <li>Maintain and promptly update your account information</li>
                  <li>Keep your password secure and confidential</li>
                  <li>Notify us immediately of any unauthorized access to your account</li>
                  <li>Accept responsibility for all activities that occur under your account</li>
                </ul>
                <p className="mt-4">
                  You are solely responsible for maintaining the confidentiality of your account credentials.
                  We are not liable for any loss or damage arising from your failure to protect your account.
                </p>
              </TermsSection>

              <TermsSection id="usage" icon={CheckCircle} title="Acceptable Use">
                <p>
                  You agree to use our Services only for lawful purposes and in accordance with these Terms.
                  When using our platform, you must:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Comply with all applicable laws and regulations</li>
                  <li>Respect the rights and dignity of others</li>
                  <li>Use automation features responsibly and ethically</li>
                  <li>Adhere to third-party platform terms (e.g., Instagram, Twitter/X)</li>
                  <li>Not engage in any activity that interferes with or disrupts our Services</li>
                </ul>
              </TermsSection>

              <TermsSection id="prohibited" icon={Ban} title="Prohibited Activities">
                <p>You must not use our Services to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Violate any laws, regulations, or third-party rights</li>
                  <li>Send spam, unsolicited messages, or harass others</li>
                  <li>Impersonate any person or entity</li>
                  <li>Upload or transmit viruses, malware, or harmful code</li>
                  <li>Attempt to gain unauthorized access to our systems</li>
                  <li>Scrape, mine, or collect data without authorization</li>
                  <li>Circumvent any security measures or access restrictions</li>
                  <li>Use automated tools to violate platform terms of service</li>
                  <li>Engage in fraudulent activities or deceptive practices</li>
                  <li>Post or share illegal, harmful, or offensive content</li>
                </ul>
                <p className="mt-4">
                  Violation of these prohibitions may result in immediate termination of your account
                  and may expose you to legal liability.
                </p>
              </TermsSection>

              <TermsSection id="intellectual-property" icon={Shield} title="Intellectual Property">
                <h4 className="text-white font-semibold mb-2">Our Intellectual Property</h4>
                <p>
                  The Service, including all content, features, functionality, software, and design elements,
                  is owned by Veefed Technologies Private Limited and is protected by copyright, trademark,
                  and other intellectual property laws. You may not copy, modify, distribute, sell, or lease
                  any part of our Services without our express written permission.
                </p>

                <h4 className="text-white font-semibold mt-6 mb-2">Your Content</h4>
                <p>
                  You retain ownership of any content you create or upload to our platform. By using our Services,
                  you grant us a non-exclusive, worldwide, royalty-free license to use, store, and process your
                  content as necessary to provide the Services.
                </p>

                <h4 className="text-white font-semibold mt-6 mb-2">Trademarks</h4>
                <p>
                  "Veefore," "Veefed Technologies," and associated logos are trademarks of Veefed Technologies
                  Private Limited. You may not use our trademarks without prior written consent.
                </p>
              </TermsSection>

              <TermsSection id="payment" icon={FileText} title="Payment Terms">
                <h4 className="text-white font-semibold mb-2">Subscription Plans</h4>
                <p>
                  Our Services are offered on a subscription basis. Details of available plans, pricing, and
                  features are available on our website. Prices are subject to change with reasonable notice.
                </p>

                <h4 className="text-white font-semibold mt-6 mb-2">Billing</h4>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Subscription fees are billed in advance on a monthly or annual basis</li>
                  <li>Payment is processed through secure third-party payment processors</li>
                  <li>You authorize us to charge your payment method for all applicable fees</li>
                  <li>All fees are non-refundable unless otherwise stated</li>
                </ul>

                <h4 className="text-white font-semibold mt-6 mb-2">Free Trials</h4>
                <p>
                  We may offer free trial periods. At the end of the trial, your subscription will automatically
                  convert to a paid plan unless you cancel before the trial ends.
                </p>

                <h4 className="text-white font-semibold mt-6 mb-2">Cancellation</h4>
                <p>
                  You may cancel your subscription at any time through your account settings. Cancellation takes
                  effect at the end of the current billing period. No refunds are provided for partial periods.
                </p>
              </TermsSection>

              <TermsSection id="termination" icon={AlertTriangle} title="Termination">
                <p>
                  We may suspend or terminate your access to our Services at any time, with or without cause,
                  and with or without notice. Reasons for termination may include:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Violation of these Terms or our policies</li>
                  <li>Engagement in prohibited activities</li>
                  <li>Non-payment of fees</li>
                  <li>Request by law enforcement or government agencies</li>
                  <li>Extended periods of inactivity</li>
                  <li>Potential harm to other users or our systems</li>
                </ul>
                <p className="mt-4">
                  Upon termination, your right to use the Services immediately ceases. Provisions that by their
                  nature should survive termination will remain in effect.
                </p>
              </TermsSection>

              <TermsSection id="disclaimers" icon={AlertTriangle} title="Disclaimers">
                <p className="font-semibold text-white">
                  THE SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND,
                  EITHER EXPRESS OR IMPLIED.
                </p>
                <p className="mt-4">
                  We do not warrant that:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>The Services will be uninterrupted, timely, secure, or error-free</li>
                  <li>Results obtained from the Services will be accurate or reliable</li>
                  <li>Any errors in the Services will be corrected</li>
                  <li>The Services will meet your specific requirements</li>
                </ul>
                <p className="mt-4">
                  You acknowledge that the use of AI-powered automation tools involves inherent risks and
                  limitations. Results may vary, and we cannot guarantee specific growth or engagement outcomes.
                </p>
              </TermsSection>

              <TermsSection id="limitation" icon={Scale} title="Limitation of Liability">
                <p>
                  TO THE MAXIMUM EXTENT PERMITTED BY LAW, VEEFED TECHNOLOGIES PRIVATE LIMITED AND ITS DIRECTORS,
                  EMPLOYEES, AGENTS, AND AFFILIATES SHALL NOT BE LIABLE FOR:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Any indirect, incidental, special, consequential, or punitive damages</li>
                  <li>Loss of profits, data, or business opportunities</li>
                  <li>Any damages arising from your use or inability to use our Services</li>
                  <li>Any third-party actions or content</li>
                </ul>
                <p className="mt-4">
                  In no event shall our total liability exceed the amount you paid to us in the twelve (12) months
                  preceding the event giving rise to the claim, or INR 10,000, whichever is greater.
                </p>
              </TermsSection>

              <TermsSection id="indemnification" icon={Shield} title="Indemnification">
                <p>
                  You agree to indemnify, defend, and hold harmless Veefed Technologies Private Limited, its
                  directors, officers, employees, agents, and affiliates from and against any claims, damages,
                  losses, liabilities, costs, and expenses (including reasonable attorneys' fees) arising from:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Your use of our Services</li>
                  <li>Your violation of these Terms</li>
                  <li>Your violation of any third-party rights</li>
                  <li>Your content or data provided through our Services</li>
                </ul>
              </TermsSection>

              <TermsSection id="governing-law" icon={Scale} title="Governing Law & Dispute Resolution">
                <h4 className="text-white font-semibold mb-2">Governing Law</h4>
                <p>
                  These Terms shall be governed by and construed in accordance with the laws of India,
                  without regard to conflict of law principles.
                </p>

                <h4 className="text-white font-semibold mt-6 mb-2">Dispute Resolution</h4>
                <p>
                  Any disputes arising out of or relating to these Terms or our Services shall be resolved
                  through binding arbitration in accordance with the Arbitration and Conciliation Act, 1996.
                  The seat of arbitration shall be Bareilly, Uttar Pradesh, India.
                </p>

                <h4 className="text-white font-semibold mt-6 mb-2">Jurisdiction</h4>
                <p>
                  Subject to the arbitration clause above, the courts of Bareilly, Uttar Pradesh, India
                  shall have exclusive jurisdiction over any disputes.
                </p>
              </TermsSection>

              <TermsSection id="changes" icon={FileText} title="Changes to Terms">
                <p>
                  We reserve the right to modify these Terms at any time. When we make material changes, we will:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Update the "Last updated" date at the top of this page</li>
                  <li>Notify you via email or through our Services</li>
                  <li>Provide at least 30 days' notice for significant changes</li>
                </ul>
                <p className="mt-4">
                  Your continued use of our Services after such changes constitutes acceptance of the modified Terms.
                  If you do not agree to the changes, you must stop using our Services.
                </p>
              </TermsSection>

              <TermsSection id="contact" icon={Mail} title="Contact Us">
                <p>
                  If you have any questions, concerns, or feedback regarding these Terms of Service,
                  please contact us:
                </p>
                <div className="mt-4 p-6 rounded-2xl bg-white/[0.03] border border-white/10">
                  <p className="text-white font-semibold mb-2">Veefed Technologies Private Limited</p>
                  <p className="mt-4">
                    <strong>Registered Office:</strong><br />
                    South City, Kargaina<br />
                    Bareilly, Uttar Pradesh<br />
                    India - 243001
                  </p>
                  <p className="mt-4">
                    <strong>Legal Inquiries:</strong> <a href="mailto:legal@veefore.com" className="text-blue-400 hover:underline">legal@veefore.com</a>
                  </p>
                  <p className="mt-2">
                    <strong>General Inquiries:</strong> <a href="mailto:hello@veefore.com" className="text-blue-400 hover:underline">hello@veefore.com</a>
                  </p>
                </div>
              </TermsSection>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <MainFooter />
    </div>
  )
}

export default TermsOfService