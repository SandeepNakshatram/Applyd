import type { RawEmail } from "@/types/pipeline";

/**
 * The 12 mock emails required by product spec section 27. Each is a full
 * RawEmail so it can be pushed straight through the real ingestion pipeline
 * (classify -> extract -> resolve -> event -> notification) in tests,
 * exactly the same path a live GmailProvider sync would take.
 */

function email(partial: Omit<RawEmail, "receivedAt"> & { receivedAt: string }): RawEmail {
  return { ...partial, receivedAt: new Date(partial.receivedAt) };
}

export const mockEmails = {
  linkedinConfirmation: email({
    providerMessageId: "msg-linkedin-confirmation-1",
    threadId: "thread-razorpay",
    from: "jobs-noreply@linkedin.com",
    fromDomain: "linkedin.com",
    subject: "Your application was sent to Razorpay",
    snippet: "Razorpay received your application for Product Manager.",
    body: "Your application was sent to Razorpay. Razorpay has received your application for the Product Manager position. You applied via LinkedIn Easy Apply on Sep 20, 2026.",
    receivedAt: "2026-09-20T09:00:00Z",
  }),

  naukriConfirmation: email({
    providerMessageId: "msg-naukri-confirmation-1",
    threadId: "thread-tcs",
    from: "noreply@naukri.com",
    fromDomain: "naukri.com",
    subject: "Application sent successfully - Software Engineer at TCS",
    snippet: "You have successfully applied for Software Engineer at TCS.",
    body: "Dear Candidate, your application for the position of Software Engineer at Tata Consultancy Services (TCS) has been sent successfully via Naukri.com on 21 Sep 2026.",
    receivedAt: "2026-09-21T10:15:00Z",
  }),

  companyAtsConfirmation: email({
    providerMessageId: "msg-ats-confirmation-1",
    threadId: "thread-microsoft",
    from: "no-reply@myworkdayjobs.com",
    fromDomain: "myworkdayjobs.com",
    subject: "Thank you for applying for Product Manager",
    snippet: "Thank you for your interest in Microsoft.",
    body: "Thank you for applying for Product Manager at Microsoft. We have received your application (Job ID: MS-88213) submitted on September 18, 2026 and will be in touch if your profile is shortlisted.",
    receivedAt: "2026-09-18T14:30:00Z",
  }),

  referralApplication: email({
    providerMessageId: "msg-referral-1",
    threadId: "thread-flipkart",
    from: "priya.sharma@flipkart.com",
    fromDomain: "flipkart.com",
    subject: "Re: Referral submitted for Senior Backend Engineer",
    snippet: "I've submitted your referral for the Senior Backend Engineer role.",
    body: "Hi, just letting you know I've gone ahead and submitted your referral for the Senior Backend Engineer role at Flipkart today. The recruiter should reach out within a week.",
    receivedAt: "2026-09-19T11:00:00Z",
  }),

  screeningEmail: email({
    providerMessageId: "msg-razorpay-screening-1",
    threadId: "thread-razorpay",
    from: "talent@razorpay.com",
    fromDomain: "razorpay.com",
    subject: "Update on your Razorpay application",
    snippet: "Your application has moved to the screening stage.",
    body: "Hi, thanks for applying to the Product Manager role at Razorpay. Your application has moved to the screening stage and our recruiting team is reviewing your profile.",
    receivedAt: "2026-09-22T08:00:00Z",
  }),

  assessmentEmail: email({
    providerMessageId: "msg-microsoft-assessment-1",
    threadId: "thread-microsoft",
    from: "no-reply@myworkdayjobs.com",
    fromDomain: "myworkdayjobs.com",
    subject: "Complete your online assessment for Product Manager",
    snippet: "Please complete the assessment within 5 days.",
    body: "As the next step for your Product Manager application (Job ID: MS-88213) at Microsoft, please complete the online assessment linked below within 5 days.",
    receivedAt: "2026-09-24T09:45:00Z",
  }),

  interviewInvitation: email({
    providerMessageId: "msg-razorpay-interview-1",
    threadId: "thread-razorpay",
    from: "talent@razorpay.com",
    fromDomain: "razorpay.com",
    subject: "Interview invitation - Product Manager at Razorpay",
    snippet: "We'd like to schedule an interview with you.",
    body: "Congratulations! We'd like to schedule an interview with you for the Product Manager position at Razorpay. Please pick a slot using the link below.",
    receivedAt: "2026-09-25T13:00:00Z",
  }),

  rejection: email({
    providerMessageId: "msg-phonepe-rejection-1",
    threadId: "thread-phonepe",
    from: "careers@phonepe.com",
    fromDomain: "phonepe.com",
    subject: "Update on your PhonePe application",
    snippet: "We will not be moving forward with your application.",
    body: "Thank you for your interest in the Backend Engineer role at PhonePe. After careful consideration, we will not be moving forward with your application at this time. We wish you the best in your search.",
    receivedAt: "2026-09-23T16:00:00Z",
  }),

  offer: email({
    providerMessageId: "msg-amazon-offer-1",
    threadId: "thread-amazon",
    from: "recruiting@amazon.com",
    fromDomain: "amazon.com",
    subject: "Your offer from Amazon",
    snippet: "We are delighted to offer you the position.",
    body: "We are delighted to offer you the position of SDE II at Amazon. Please find the attached offer letter and let us know your decision by end of week.",
    receivedAt: "2026-09-26T10:00:00Z",
  }),

  jobAlert: email({
    providerMessageId: "msg-linkedin-jobalert-1",
    threadId: "thread-jobalert",
    from: "jobalerts-noreply@linkedin.com",
    fromDomain: "linkedin.com",
    subject: "New jobs matching your preferences",
    snippet: "25 new jobs match your search: Product Manager",
    body: "New jobs matching your preferences: Product Manager at Google, Product Manager at Meta, and 23 more. Update your job alert preferences anytime.",
    receivedAt: "2026-09-21T07:00:00Z",
  }),

  irrelevant: email({
    providerMessageId: "msg-newsletter-1",
    threadId: "thread-newsletter",
    from: "news@techcrunch.com",
    fromDomain: "techcrunch.com",
    subject: "Your weekly tech digest",
    snippet: "This week in tech: AI, funding rounds, and more.",
    body: "This week in tech: a roundup of the biggest funding rounds, product launches, and AI news from around the industry.",
    receivedAt: "2026-09-20T06:00:00Z",
  }),

  // Not one of the 12 required mocks — an extra case for exercising the
  // Review Queue path (spec section 15/27: "uncertain extraction goes to
  // Review Queue"). Confirms REJECTION/OFFER wording without a clean
  // "<role> at <company>" phrase the extractor can pattern-match.
  ambiguousApplication: email({
    providerMessageId: "msg-ambiguous-1",
    threadId: "thread-ambiguous",
    from: "notifications@greenhouse.io",
    fromDomain: "greenhouse.io",
    subject: "Thank you for applying",
    snippet: "We've received your application.",
    body: "Thank you for applying. We've received your application and will follow up soon if there's a fit.",
    receivedAt: "2026-09-22T12:00:00Z",
  }),

  duplicateConfirmation: email({
    providerMessageId: "msg-linkedin-confirmation-1-resend",
    threadId: "thread-razorpay",
    from: "jobs-noreply@linkedin.com",
    fromDomain: "linkedin.com",
    subject: "Your application was sent to Razorpay",
    snippet: "Razorpay received your application for Product Manager.",
    body: "Your application was sent to Razorpay. Razorpay has received your application for the Product Manager position. You applied via LinkedIn Easy Apply on Sep 20, 2026.",
    receivedAt: "2026-09-20T09:05:00Z",
  }),
} satisfies Record<string, RawEmail>;

export const allMockEmails: RawEmail[] = Object.values(mockEmails);
