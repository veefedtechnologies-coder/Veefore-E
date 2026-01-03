import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Shield, Lock, Eye, Database, UserCheck, Globe,
  Mail, FileText
} from 'lucide-react'
import { useIsMobile } from '../hooks/use-is-mobile';
import { SEO } from '../lib/seo-optimization'


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
const PolicySection = ({ id, icon: Icon, title, children }: { id: string, icon: React.ComponentType<{ className?: string }>, title: string, children: React.ReactNode }) => (
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

const PrivacyPolicy = () => {
  const isMobile = useIsMobile()

  // Table of contents
  const sections = [
    { id: 'introduction', title: 'Introduction' },
    { id: 'information-collected', title: 'Information We Collect' },
    { id: 'how-we-use', title: 'How We Use Your Information' },
    { id: 'data-sharing', title: 'Data Sharing & Disclosure' },
    { id: 'data-security', title: 'Data Security' },
    { id: 'your-rights', title: 'Your Rights' },
    { id: 'cookies', title: 'Cookies & Tracking' },
    { id: 'third-party', title: 'Third-Party Services' },
    { id: 'children', title: 'Children\'s Privacy' },
    { id: 'changes', title: 'Changes to This Policy' },
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
        title="Privacy Policy - Veefore | Your Data, Your Rights"
        description="Learn how Veefore collects, uses, and protects your personal information. We are committed to transparency and protecting your privacy."
      />

      {/* Ambient Background */}
      <div className={`${isMobile ? 'absolute h-[600vh]' : 'fixed'} inset-0 pointer-events-none overflow-hidden -z-10`}>
        <GradientOrb className={`${isMobile ? 'w-[400px] h-[400px]' : 'w-[800px] h-[800px]'} -top-[100px] -left-[100px]`} color="blue" />
        <GradientOrb className={`${isMobile ? 'w-[300px] h-[300px]' : 'w-[600px] h-[600px]'} top-[30%] -right-[100px]`} color="purple" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 256 256%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noise%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%221%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noise)%22 opacity=%220.03%22/%3E%3C/svg%3E')] opacity-50" />
      </div>

      {/* Navigation */}


      {/* Hero Section */}
      <section className="relative pt-28 pb-12 md:pt-36 md:pb-16 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm mb-6">
              <Shield className="w-4 h-4 mr-2" />
              Legal Document
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-4"
          >
            <span className="text-white">Privacy </span>
            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Policy
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-base md:text-lg text-white/50 max-w-2xl mx-auto mb-4"
          >
            Your privacy matters to us. This policy explains how we collect, use, and protect your information.
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
                        ? 'text-blue-400 font-medium border-l-2 border-blue-400 pl-3 -ml-3'
                        : 'text-white/50 hover:text-white'
                        }`}
                    >
                      {section.title}
                    </a>
                  ))}
                </nav>
              </div>
            </aside>

            {/* Policy Content */}
            <div>
              <PolicySection id="introduction" icon={FileText} title="Introduction">
                <p>
                  Welcome to Veefore ("we," "our," or "us"), a product of <strong>Veefed Technologies Private Limited</strong>,
                  a company incorporated under the laws of India with its registered office at South City, Kargaina,
                  Bareilly, Uttar Pradesh - 243001.
                </p>
                <p>
                  This Privacy Policy describes how we collect, use, store, share, and protect your personal information
                  when you use our website, applications, and services (collectively, the "Services"). By accessing or
                  using our Services, you agree to the collection and use of information in accordance with this policy.
                </p>
                <p>
                  We are committed to protecting your privacy and ensuring that your personal data is handled responsibly
                  and in compliance with applicable data protection laws, including the Information Technology Act, 2000
                  and the Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal
                  Data or Information) Rules, 2011.
                </p>
              </PolicySection>

              <PolicySection id="information-collected" icon={Database} title="Information We Collect">
                <p>We collect information in the following ways:</p>

                <h4 className="text-white font-semibold mt-6 mb-2">Information You Provide</h4>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>Account Information:</strong> When you register, we collect your name, email address, and password.</li>
                  <li><strong>Profile Information:</strong> Any additional information you choose to add to your profile.</li>
                  <li><strong>Payment Information:</strong> When you subscribe, payment is processed through secure third-party payment processors. We do not store your full credit card details.</li>
                  <li><strong>Communication Data:</strong> Information you provide when contacting our support team or participating in surveys.</li>
                  <li><strong>Social Media Data:</strong> When you connect your social media accounts (e.g., Instagram), we access information as authorized by you and the platform's API terms.</li>
                </ul>

                <h4 className="text-white font-semibold mt-6 mb-2">Information Collected Automatically</h4>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>Device Information:</strong> IP address, browser type, operating system, device identifiers.</li>
                  <li><strong>Usage Data:</strong> Pages visited, features used, time spent, click patterns, and navigation paths.</li>
                  <li><strong>Log Data:</strong> Server logs containing access times, referring URLs, and error reports.</li>
                  <li><strong>Cookies & Similar Technologies:</strong> We use cookies and local storage to enhance your experience and gather analytics.</li>
                </ul>
              </PolicySection>

              <PolicySection id="how-we-use" icon={Eye} title="How We Use Your Information">
                <p>We use the collected information for the following purposes:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>Service Delivery:</strong> To provide, maintain, and improve our Services, including AI-powered engagement automation features.</li>
                  <li><strong>Personalization:</strong> To customize your experience and provide relevant content and recommendations.</li>
                  <li><strong>Communication:</strong> To send transactional emails, service updates, security alerts, and marketing communications (with your consent).</li>
                  <li><strong>Analytics:</strong> To analyze usage patterns, measure performance, and improve our Services.</li>
                  <li><strong>Security:</strong> To detect, prevent, and respond to fraud, abuse, or security incidents.</li>
                  <li><strong>Legal Compliance:</strong> To comply with applicable laws, regulations, and legal processes.</li>
                  <li><strong>AI Model Training:</strong> To improve our AI algorithms. Note: We do not use your private messages or personal content for training without explicit consent.</li>
                </ul>
              </PolicySection>

              <PolicySection id="data-sharing" icon={UserCheck} title="Data Sharing & Disclosure">
                <p>We do not sell your personal information. We may share data in the following circumstances:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>Service Providers:</strong> With trusted third-party vendors who assist in operating our Services (hosting, analytics, payment processing), bound by confidentiality agreements.</li>
                  <li><strong>Social Media Platforms:</strong> When you use features that interact with connected social accounts, data is shared as necessary and in accordance with platform APIs.</li>
                  <li><strong>Legal Requirements:</strong> When required by law, court order, or governmental authority, or to protect our rights, safety, or property.</li>
                  <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets, your data may be transferred as part of the transaction.</li>
                  <li><strong>With Your Consent:</strong> When you explicitly authorize us to share data for specific purposes.</li>
                </ul>
              </PolicySection>

              <PolicySection id="data-security" icon={Lock} title="Data Security">
                <p>
                  We implement industry-standard security measures to protect your personal information from unauthorized
                  access, alteration, disclosure, or destruction. These measures include:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Encryption of data in transit (TLS/SSL) and at rest</li>
                  <li>Secure authentication mechanisms including password hashing</li>
                  <li>Regular security audits and vulnerability assessments</li>
                  <li>Access controls limiting data access to authorized personnel only</li>
                  <li>Monitoring for suspicious activities and potential breaches</li>
                </ul>
                <p className="mt-4">
                  While we strive to protect your data, no method of transmission over the Internet or electronic storage
                  is 100% secure. We cannot guarantee absolute security but are committed to promptly addressing any
                  security incidents.
                </p>
              </PolicySection>

              <PolicySection id="your-rights" icon={UserCheck} title="Your Rights">
                <p>Depending on your location, you may have the following rights regarding your personal data:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>Access:</strong> Request a copy of the personal information we hold about you.</li>
                  <li><strong>Correction:</strong> Request correction of inaccurate or incomplete data.</li>
                  <li><strong>Deletion:</strong> Request deletion of your personal data, subject to legal retention requirements.</li>
                  <li><strong>Data Portability:</strong> Request a machine-readable copy of your data.</li>
                  <li><strong>Opt-Out:</strong> Unsubscribe from marketing communications at any time.</li>
                  <li><strong>Withdraw Consent:</strong> Revoke previously given consent for specific data processing activities.</li>
                </ul>
                <p className="mt-4">
                  To exercise these rights, please contact us at <a href="mailto:privacy@veefore.com" className="text-blue-400 hover:underline">privacy@veefore.com</a>.
                  We will respond to your request within 30 days.
                </p>
              </PolicySection>

              <PolicySection id="cookies" icon={Globe} title="Cookies & Tracking Technologies">
                <p>
                  We use cookies and similar tracking technologies to enhance your experience and gather information
                  about how our Services are used.
                </p>
                <h4 className="text-white font-semibold mt-6 mb-2">Types of Cookies We Use</h4>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>Essential Cookies:</strong> Required for basic functionality such as authentication and security.</li>
                  <li><strong>Analytics Cookies:</strong> Help us understand how users interact with our Services.</li>
                  <li><strong>Preference Cookies:</strong> Remember your settings and preferences.</li>
                  <li><strong>Marketing Cookies:</strong> Used to deliver relevant advertisements (only with consent).</li>
                </ul>
                <p className="mt-4">
                  You can control cookies through your browser settings. Disabling certain cookies may affect functionality.
                </p>
              </PolicySection>

              <PolicySection id="third-party" icon={Globe} title="Third-Party Services">
                <p>
                  Our Services may integrate with third-party platforms and services. This policy does not cover the
                  privacy practices of these third parties. We encourage you to review their privacy policies.
                </p>
                <h4 className="text-white font-semibold mt-6 mb-2">Key Third-Party Integrations</h4>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>Social Media Platforms:</strong> Instagram, Twitter/X (subject to their respective terms and privacy policies)</li>
                  <li><strong>Payment Processors:</strong> Secure payment gateways compliant with PCI-DSS standards</li>
                  <li><strong>Analytics Providers:</strong> Tools to understand usage patterns and improve Services</li>
                  <li><strong>Cloud Infrastructure:</strong> Secure hosting and data storage services</li>
                </ul>
              </PolicySection>

              <PolicySection id="children" icon={UserCheck} title="Children's Privacy">
                <p>
                  Our Services are not intended for individuals under the age of 18. We do not knowingly collect personal
                  information from children. If we become aware that we have collected data from a child without parental
                  consent, we will take steps to delete such information promptly.
                </p>
                <p>
                  If you are a parent or guardian and believe your child has provided us with personal information, please
                  contact us at <a href="mailto:privacy@veefore.com" className="text-blue-400 hover:underline">privacy@veefore.com</a>.
                </p>
              </PolicySection>

              <PolicySection id="changes" icon={FileText} title="Changes to This Policy">
                <p>
                  We may update this Privacy Policy from time to time to reflect changes in our practices, technology,
                  legal requirements, or other factors. When we make material changes, we will:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Update the "Last updated" date at the top of this page</li>
                  <li>Notify you via email or prominent notice on our Services</li>
                  <li>Seek your consent if required by applicable law</li>
                </ul>
                <p className="mt-4">
                  We encourage you to review this policy periodically to stay informed about how we protect your information.
                </p>
              </PolicySection>

              <PolicySection id="contact" icon={Mail} title="Contact Us">
                <p>
                  If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices,
                  please contact us:
                </p>
                <div className="mt-4 p-6 rounded-2xl bg-white/[0.03] border border-white/10">
                  <p className="text-white font-semibold mb-2">Veefed Technologies Private Limited</p>
                  <p>Data Protection Officer</p>
                  <p className="mt-4">
                    <strong>Address:</strong><br />
                    South City, Kargaina<br />
                    Bareilly, Uttar Pradesh<br />
                    India - 243001
                  </p>
                  <p className="mt-4">
                    <strong>Email:</strong> <a href="mailto:privacy@veefore.com" className="text-blue-400 hover:underline">privacy@veefore.com</a>
                  </p>
                  <p className="mt-2">
                    <strong>General Inquiries:</strong> <a href="mailto:hello@veefore.com" className="text-blue-400 hover:underline">hello@veefore.com</a>
                  </p>
                </div>
              </PolicySection>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}

    </div>
  )
}

export default PrivacyPolicy