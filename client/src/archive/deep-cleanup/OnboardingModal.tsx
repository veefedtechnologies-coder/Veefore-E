// ULTRA SIMPLE TEST COMPONENT
interface OnboardingModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function OnboardingModal({ isOpen, onClose }: OnboardingModalProps) {
  console.log('🔵 SIMPLE MODAL CALLED - isOpen:', isOpen)
  console.log('🔵 SIMPLE MODAL PROPS:', { isOpen, onClose })
  
  if (!isOpen) {
    console.log('🔴 SIMPLE MODAL - returning null')
    return null
  }
  
  console.log('✅ SIMPLE MODAL - rendering now!')
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[99999]">
      <div className="bg-white dark:bg-gray-800 p-5 rounded-lg max-w-md w-[90%] shadow-xl">
        <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">
          🎉 Onboarding Test Works!
        </h2>
        <p className="mb-4 text-gray-600 dark:text-gray-400">
          The strict signup flow is working correctly.
        </p>
        <button 
          onClick={onClose}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 px-6 rounded text-base font-medium transition-colors duration-200"
        >
          Complete Onboarding
        </button>
      </div>
    </div>
  )
}