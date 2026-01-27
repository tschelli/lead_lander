export type QuestionOption = {
  label: string;
  value: string;
};

export type Question = {
  id: string;
  type: "radio" | "checkbox" | "select" | "text" | "textarea" | "slider";
  label: string;
  options?: QuestionOption[];
  required?: boolean;
  showIf?: {
    questionId: string;
    equals: string | string[];
  };
};

export const DEFAULT_QUESTIONS: Question[] = [
  {
    id: "program_interest",
    type: "select",
    label: "Which program are you interested in?",
    required: true,
    options: []
  },
  {
    id: "campus_interest",
    type: "radio",
    label: "Are you interested in this campus?",
    required: true,
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" }
    ]
  },
  {
    id: "education_level",
    type: "select",
    label: "Highest level of education",
    required: true,
    options: [
      { label: "Some high school", value: "some_high_school" },
      { label: "High school diploma or GED", value: "high_school" },
      { label: "Some college", value: "some_college" },
      { label: "Associate degree", value: "associate" },
      { label: "Bachelor's degree", value: "bachelor" }
    ]
  },
  {
    id: "start_timeline",
    type: "radio",
    label: "When would you like to start?",
    required: true,
    options: [
      { label: "Within 30 days", value: "30_days" },
      { label: "1-3 months", value: "1_3_months" },
      { label: "3+ months", value: "3_plus_months" }
    ]
  },
  {
    id: "schedule_preference",
    type: "checkbox",
    label: "Which schedules work for you?",
    options: [
      { label: "Daytime", value: "daytime" },
      { label: "Evening", value: "evening" },
      { label: "Weekend", value: "weekend" }
    ]
  },
  {
    id: "financial_aid",
    type: "radio",
    label: "Do you plan to use financial aid?",
    required: true,
    options: [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
      { label: "Not sure", value: "not_sure" }
    ]
  },
  {
    id: "support_needs",
    type: "textarea",
    label: "Anything else you'd like us to know?"
  }
];
