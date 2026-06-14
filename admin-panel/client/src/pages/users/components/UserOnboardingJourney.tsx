/**
 * UserOnboardingJourney component
 *
 * Renders the complete two-phase onboarding journey for a user:
 * - Phase 1: Waitlist questionnaire (business type, team size, tools, goals,
 *             content types, urgency)
 * - Phase 2: Post-signup profile setup (progress bar, profile fields)
 *
 * Extracted from UserProfile to keep that component under 400 lines.
 */

import React from 'react';
import { Calendar, FileText, CheckCircle } from 'lucide-react';

/** Props accepted by the UserOnboardingJourney component */
export interface UserOnboardingJourneyProps {
  /** Full user detail object returned by the /user-detail API */
  user: any;
}

/**
 * UserOnboardingJourney renders both phases of the onboarding flow
 * including the waitlist questionnaire answers and post-signup progress.
 */
const UserOnboardingJourney: React.FC<UserOnboardingJourneyProps> = ({ user }) => {
  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">
        Complete Onboarding Journey
      </h3>

      {/* Onboarding Summary */}
      <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">
              Overall Onboarding Status
            </h4>
            <p className="text-xs text-gray-600">
              Complete journey from waitlist to app usage
            </p>
          </div>
          <div className="flex space-x-4">
            <div className="text-center">
              <div
                className={`w-3 h-3 rounded-full mx-auto mb-1 ${
                  user.waitlistStatus === 'active' || user.waitlistStatus === 'approved'
                    ? 'bg-green-500'
                    : 'bg-yellow-500'
                }`}
              ></div>
              <p className="text-xs text-gray-600">Waitlist</p>
            </div>
            <div className="text-center">
              <div
                className={`w-3 h-3 rounded-full mx-auto mb-1 ${
                  user.isOnboarded ? 'bg-green-500' : 'bg-gray-300'
                }`}
              ></div>
              <p className="text-xs text-gray-600">Signup</p>
            </div>
            <div className="text-center">
              <div
                className={`w-3 h-3 rounded-full mx-auto mb-1 ${
                  user.onboardingStep >= 5
                    ? 'bg-green-500'
                    : user.onboardingStep > 0
                    ? 'bg-yellow-500'
                    : 'bg-gray-300'
                }`}
              ></div>
              <p className="text-xs text-gray-600">Complete</p>
            </div>
          </div>
        </div>
      </div>

      {/* Phase 1: Waitlist Onboarding */}
      <div className="mb-8">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Calendar className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-900">
              Phase 1: Waitlist Onboarding
            </h4>
            <p className="text-xs text-gray-500">
              Questionnaire completed when joining waitlist
            </p>
          </div>
        </div>

        {/* Waitlist dates */}
        <div className="mb-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-xs text-gray-600 mb-1">Joined Waitlist</p>
              <p className="text-sm font-medium text-gray-900">
                {user.waitlistJoinedAt
                  ? new Date(user.waitlistJoinedAt).toLocaleDateString()
                  : 'N/A'}
              </p>
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-xs text-gray-600 mb-1">Status</p>
              <p
                className={`text-sm font-medium ${
                  user.waitlistStatus === 'active'
                    ? 'text-green-600'
                    : user.waitlistStatus === 'waitlisted'
                    ? 'text-yellow-600'
                    : user.waitlistStatus === 'approved'
                    ? 'text-green-600'
                    : 'text-gray-600'
                }`}
              >
                {user.waitlistStatus || 'N/A'}
              </p>
            </div>
          </div>
        </div>

        {/* Waitlist Questionnaire */}
        <div className="space-y-4">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-green-100 rounded-lg">
              <FileText className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h5 className="text-sm font-semibold text-gray-900">
                Waitlist Questionnaire
              </h5>
              <p className="text-xs text-gray-500">
                Questions answered when joining waitlist
              </p>
            </div>
          </div>

          {/* Q1: What describes you best? */}
          <div className="border-l-4 border-green-500 pl-4 py-2">
            <h5 className="text-sm font-medium text-gray-900 mb-2">
              What describes you best?
            </h5>
            <div className="flex items-center space-x-2">
              <span className="text-lg">
                {user.businessType === 'creator'
                  ? '🎨'
                  : user.businessType === 'business'
                  ? '🏢'
                  : user.businessType === 'agency'
                  ? '📈'
                  : user.businessType === 'freelancer'
                  ? '💼'
                  : '❓'}
              </span>
              <span className="text-sm text-gray-700">
                {user.businessType === 'creator'
                  ? 'Content Creator'
                  : user.businessType === 'business'
                  ? 'Business Owner'
                  : user.businessType === 'agency'
                  ? 'Marketing Agency'
                  : user.businessType === 'freelancer'
                  ? 'Freelancer'
                  : user.businessType || 'Not answered'}
              </span>
            </div>
          </div>

          {/* Q2: How big is your team? */}
          <div className="border-l-4 border-green-500 pl-4 py-2">
            <h5 className="text-sm font-medium text-gray-900 mb-2">
              How big is your team?
            </h5>
            <div className="flex items-center space-x-2">
              <span className="text-lg">
                {user.teamSize === 'solo'
                  ? '👤'
                  : user.teamSize === 'small'
                  ? '👥'
                  : user.teamSize === 'medium'
                  ? '👨‍👩‍👧‍👦'
                  : user.teamSize === 'large'
                  ? '🏘️'
                  : '❓'}
              </span>
              <span className="text-sm text-gray-700">
                {user.teamSize === 'solo'
                  ? 'Just Me'
                  : user.teamSize === 'small'
                  ? '2-5 People'
                  : user.teamSize === 'medium'
                  ? '6-20 People'
                  : user.teamSize === 'large'
                  ? '20+ People'
                  : user.teamSize || 'Not answered'}
              </span>
            </div>
          </div>

          {/* Q3: What tools do you currently use? */}
          <div className="border-l-4 border-green-500 pl-4 py-2">
            <h5 className="text-sm font-medium text-gray-900 mb-2">
              What tools do you currently use?
            </h5>
            <div className="flex flex-wrap gap-2">
              {user.currentTools && user.currentTools.length > 0 ? (
                user.currentTools.map((tool: string, index: number) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800"
                  >
                    {tool === 'canva'
                      ? '🎨 Canva'
                      : tool === 'hootsuite'
                      ? '📅 Hootsuite'
                      : tool === 'buffer'
                      ? '⏰ Buffer'
                      : tool === 'later'
                      ? '📱 Later'
                      : tool === 'photoshop'
                      ? '🖼️ Photoshop'
                      : tool === 'figma'
                      ? '✨ Figma'
                      : tool === 'none'
                      ? '✋ None / Manual'
                      : tool}
                  </span>
                ))
              ) : (
                <span className="text-sm text-gray-500">Not answered</span>
              )}
            </div>
          </div>

          {/* Q4: What's your primary goal? */}
          <div className="border-l-4 border-green-500 pl-4 py-2">
            <h5 className="text-sm font-medium text-gray-900 mb-2">
              What's your primary goal?
            </h5>
            <div className="flex items-center space-x-2">
              <span className="text-lg">
                {user.primaryGoal === 'growth'
                  ? '📈'
                  : user.primaryGoal === 'engagement'
                  ? '❤️'
                  : user.primaryGoal === 'sales'
                  ? '💰'
                  : user.primaryGoal === 'efficiency'
                  ? '⏱️'
                  : '❓'}
              </span>
              <span className="text-sm text-gray-700">
                {user.primaryGoal === 'growth'
                  ? 'Grow Followers'
                  : user.primaryGoal === 'engagement'
                  ? 'Boost Engagement'
                  : user.primaryGoal === 'sales'
                  ? 'Drive Sales'
                  : user.primaryGoal === 'efficiency'
                  ? 'Save Time'
                  : user.primaryGoal || 'Not answered'}
              </span>
            </div>
          </div>

          {/* Q5: What content do you create? */}
          <div className="border-l-4 border-green-500 pl-4 py-2">
            <h5 className="text-sm font-medium text-gray-900 mb-2">
              What content do you create?
            </h5>
            <div className="flex flex-wrap gap-2">
              {user.contentTypes && user.contentTypes.length > 0 ? (
                user.contentTypes.map((type: string, index: number) => (
                  <span
                    key={index}
                    className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800"
                  >
                    {type === 'posts'
                      ? '📝 Social Posts'
                      : type === 'stories'
                      ? '📸 Stories'
                      : type === 'videos'
                      ? '🎥 Videos'
                      : type === 'reels'
                      ? '🎬 Reels/Shorts'
                      : type === 'graphics'
                      ? '🖌️ Graphics'
                      : type === 'blogs'
                      ? '📄 Blog Content'
                      : type}
                  </span>
                ))
              ) : (
                <span className="text-sm text-gray-500">Not answered</span>
              )}
            </div>
          </div>

          {/* Q6: When do you need this solution? */}
          <div className="border-l-4 border-green-500 pl-4 py-2">
            <h5 className="text-sm font-medium text-gray-900 mb-2">
              When do you need this solution?
            </h5>
            <div className="flex items-center space-x-2">
              <span className="text-lg">
                {user.urgency === 'asap'
                  ? '🚀'
                  : user.urgency === 'month'
                  ? '📅'
                  : user.urgency === 'quarter'
                  ? '🗓️'
                  : user.urgency === 'exploring'
                  ? '🔍'
                  : '❓'}
              </span>
              <span className="text-sm text-gray-700">
                {user.urgency === 'asap'
                  ? 'Right Now'
                  : user.urgency === 'month'
                  ? 'Within a Month'
                  : user.urgency === 'quarter'
                  ? 'Next Quarter'
                  : user.urgency === 'exploring'
                  ? 'Just Exploring'
                  : user.urgency || 'Not answered'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Phase 2: Post-Signup Onboarding */}
      <div className="mb-8">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2 bg-purple-100 rounded-lg">
            <CheckCircle className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-900">
              Phase 2: Post-Signup Onboarding
            </h4>
            <p className="text-xs text-gray-500">
              Profile setup after getting access to the app
            </p>
          </div>
        </div>

        {/* Onboarding Progress */}
        <div className="mb-4 p-4 bg-purple-50 rounded-lg">
          <div className="flex items-center space-x-3 mb-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <CheckCircle className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h5 className="text-sm font-semibold text-gray-900">Onboarding Progress</h5>
              <p className="text-xs text-gray-500">How far they've progressed in the app</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Current Step:</span>
              <span className="font-medium">{user.onboardingStep || 0} / 5</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${((user.onboardingStep || 0) / 5) * 100}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Completed At:</span>
              <span className="font-medium">
                {user.onboardingCompletedAt
                  ? new Date(user.onboardingCompletedAt).toLocaleDateString()
                  : 'Not completed'}
              </span>
            </div>
          </div>
        </div>

        {/* Additional Profile Information from OnboardingFlow */}
        {(user.fullName ||
          user.role ||
          user.companyName ||
          user.companySize ||
          user.primaryGoals ||
          user.currentChallenges ||
          user.monthlyBudget ||
          user.platforms ||
          user.postingFrequency) && (
          <div className="p-4 bg-blue-50 rounded-lg">
            <h5 className="text-sm font-semibold text-gray-900 mb-3">
              Profile Information
            </h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {user.fullName && (
                <div>
                  <p className="text-xs text-gray-600">Full Name</p>
                  <p className="text-sm font-medium text-gray-900">{user.fullName}</p>
                </div>
              )}
              {user.role && (
                <div>
                  <p className="text-xs text-gray-600">Role</p>
                  <p className="text-sm font-medium text-gray-900">{user.role}</p>
                </div>
              )}
              {user.companyName && (
                <div>
                  <p className="text-xs text-gray-600">Company Name</p>
                  <p className="text-sm font-medium text-gray-900">{user.companyName}</p>
                </div>
              )}
              {user.companySize && (
                <div>
                  <p className="text-xs text-gray-600">Company Size</p>
                  <p className="text-sm font-medium text-gray-900">{user.companySize}</p>
                </div>
              )}
              {user.currentChallenges && (
                <div className="md:col-span-2">
                  <p className="text-xs text-gray-600">Current Challenges</p>
                  <p className="text-sm font-medium text-gray-900">
                    {user.currentChallenges}
                  </p>
                </div>
              )}
              {user.monthlyBudget && (
                <div>
                  <p className="text-xs text-gray-600">Monthly Budget</p>
                  <p className="text-sm font-medium text-gray-900">{user.monthlyBudget}</p>
                </div>
              )}
              {user.onboardingPostingFrequency && (
                <div>
                  <p className="text-xs text-gray-600">Posting Frequency</p>
                  <p className="text-sm font-medium text-gray-900">
                    {user.onboardingPostingFrequency}
                  </p>
                </div>
              )}
              {user.primaryGoals && user.primaryGoals.length > 0 && (
                <div className="md:col-span-2">
                  <p className="text-xs text-gray-600 mb-1">Primary Goals</p>
                  <div className="flex flex-wrap gap-1">
                    {user.primaryGoals.map((goal: string, index: number) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                      >
                        {goal}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {user.platforms && user.platforms.length > 0 && (
                <div className="md:col-span-2">
                  <p className="text-xs text-gray-600 mb-1">Social Media Platforms</p>
                  <div className="flex flex-wrap gap-1">
                    {user.platforms.map((platform: string, index: number) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                      >
                        {platform}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserOnboardingJourney;
