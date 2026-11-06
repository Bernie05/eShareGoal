"use client";

import { LayoutTemplate } from "lucide-react";
import { useEmailTemplates } from "@/components/app/email-store";
import type { TemplateStatus } from "@/lib/goal-templates";
import { MetricCard } from "./metric-card";
import { BASE_PATH } from "@/lib/constants";

// System Admin dashboard numbers whose data is kept in this browser in the preview (email templates, workflows).

interface TemplatesMetricProps {
  goal: TemplateStatus[];
}
/** goal: each goal template's status (from the server). Published templates are the ones Owners can use. */
export function TemplatesMetric({ goal }: TemplatesMetricProps) {
  const email = useEmailTemplates();
  const goalOn = goal.filter((st) => st === "Published").length, emailOn = email.filter((t) => t.status === "Published").length;
  return <MetricCard m={{
    label: "Published templates", Icon: LayoutTemplate, value: goalOn + emailOn, total: goal.length + email.length, tone: "primary",
    href: `${BASE_PATH}/templates`, link: "Open Goal templates",
    details: [
      `Goal: ${goalOn} of ${goal.length} · ${goal.filter((st) => st === "Draft").length} draft · ${goal.filter((st) => st === "Retired").length} retired`,
      `Email: ${emailOn} of ${email.length} · ${email.length - emailOn} draft`,
    ],
  }} />;
}
