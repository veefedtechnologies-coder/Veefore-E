import { useReducer } from 'react'

import { FAQ_ITEMS } from '../constants/content'
import { COLORS } from '../constants/colors'
import { faqReducer, type FaqState } from './faqReducer'

/** Initial accordion state — no item is open. */
const INITIAL_STATE: FaqState = null

/**
 * FAQ Section (Section 10).
 *
 * Renders the eight {@link FAQ_ITEMS} as an accordion in which at most one
 * item is open at a time. Open/closed state is owned by the pure
 * {@link faqReducer} (`useReducer`): activating a closed item expands it and
 * collapses any previously open item; activating the open item collapses it
 * (Requirements 15.1, 15.2 — Design Correctness Property 13).
 *
 * Visuals (Requirement 15.3):
 *   - Closed: question text with a right-aligned `+` indicator.
 *   - Open: the indicator rotates 45° so `+` reads as `×`, a coral 3px left
 *     border appears, and the answer reveals via a `max-height` slide-down
 *     transition.
 *
 * Accessibility (Requirements 21.3, 21.4):
 *   - Each header is a real `<button>` carrying `aria-expanded` and
 *     `aria-controls`, so it is keyboard reachable and operable.
 *   - The answer region is a labelled `region` with an `id` matching the
 *     button's `aria-controls` plus `aria-labelledby` back to the button.
 *   - A visible coral focus ring is rendered via `focus-visible` utilities.
 *
 * Colour system: deep navy background, white questions, muted answers, coral
 * accents only — ZERO purple.
 *
 * Requirements: 15.1, 15.2, 15.3, 21.3, 21.4
 */
export const FaqSection: React.FC = () => {
  const [openIndex, dispatch] = useReducer(faqReducer, INITIAL_STATE)

  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="relative w-full px-6 py-24 md:py-32"
      style={{ backgroundColor: COLORS.bgPrimary }}
    >
      <div className="mx-auto max-w-3xl">
        <h2
          id="faq-heading"
          className="mb-12 text-center text-3xl font-bold tracking-tight md:mb-16 md:text-5xl"
          style={{ fontFamily: "'Syne', sans-serif", color: COLORS.textPrimary }}
        >
          Questions? We Have Answers.
        </h2>

        <ul className="flex flex-col gap-4">
          {FAQ_ITEMS.map((item, index) => {
            const isOpen = openIndex === index
            const buttonId = `faq-trigger-${index}`
            const panelId = `faq-panel-${index}`

            return (
              <li
                key={item.question}
                className="overflow-hidden rounded-xl transition-colors duration-200"
                style={{
                  backgroundColor: COLORS.bgSecondary,
                  borderLeft: `3px solid ${isOpen ? COLORS.coral : 'transparent'}`,
                }}
              >
                <h3 className="m-0">
                  <button
                    type="button"
                    id={buttonId}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => dispatch(index)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left outline-none transition-colors duration-200 hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-[#4C82F7] focus-visible:ring-offset-2 focus-visible:ring-offset-[#040C18] md:px-6"
                  >
                    <span
                      className="text-base font-medium md:text-lg"
                      style={{
                        fontFamily: "'DM Sans', sans-serif",
                        color: COLORS.textPrimary,
                      }}
                    >
                      {item.question}
                    </span>
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-2xl leading-none transition-transform duration-300 ease-out"
                      style={{
                        color: COLORS.coral,
                        transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                      }}
                    >
                      +
                    </span>
                  </button>
                </h3>

                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  className="overflow-hidden transition-[max-height] duration-300 ease-out"
                  style={{ maxHeight: isOpen ? '24rem' : '0rem' }}
                >
                  <p
                    className="px-5 pb-6 text-sm leading-relaxed md:px-6 md:text-base"
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      color: COLORS.textSecondary,
                    }}
                  >
                    {item.answer}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
