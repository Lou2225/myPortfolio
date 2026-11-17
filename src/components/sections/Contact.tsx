"use client";

import React, { useState } from "react";
import { usePortfolio } from "@/context/PortfolioContext";
import { Button } from "@/components/ui/Button";
import {
  Eyebrow,
  DisplayHeading,
  BodyText,
  MonoLabel,
} from "@/components/ui/Typography";
import { NameField } from "@/components/ui/fields/NameField";
import { EmailField } from "@/components/ui/fields/EmailField";
import { SubjectField } from "@/components/ui/fields/SubjectField";
import { MessageField } from "@/components/ui/fields/MessageField";
import {
  validateName,
  validateEmail,
  validateSubject,
  validateMessage,
} from "@/lib/inputValidation";
import { useOfflineStatus } from "@/components/pwa/OfflineManager";
import { announceBrandPortalStatus } from "@/lib/brandPortalStatus";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  Send,
} from "lucide-react";

export function Contact() {
  const { profile, sectionHeaders, trackEvent } = usePortfolio();
  const { isOnline, queueContactInquiry } = useOfflineStatus();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
    honeypot: "",
  });
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "queued" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const isFormValid =
    validateName(formData.name).valid &&
    validateEmail(formData.email).valid &&
    validateSubject(formData.subject).valid &&
    validateMessage(formData.message).valid;

  const queueAndResetForm = () => {
    queueContactInquiry({
      name: formData.name,
      email: formData.email,
      subject: formData.subject,
      message: formData.message,
      honeypot: formData.honeypot,
    });
    setStatus("queued");
    setSubmitAttempted(false);
    announceBrandPortalStatus({
      tone: "offline",
      label: "Message Queued",
      detail: "Will sync automatically when online",
      durationMs: 4000,
    });
    setFormData({
      name: "",
      email: "",
      subject: "",
      message: "",
      honeypot: "",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitAttempted(true);

    if (!isFormValid) {
      setStatus("error");
      const msg =
        "Please check the highlighted fields above and complete all required inputs.";
      setErrorMessage(msg);
      announceBrandPortalStatus({
        tone: "error",
        label: "Check Form Fields",
        detail: msg,
      });
      return;
    }

    setStatus("loading");
    setErrorMessage("");
    announceBrandPortalStatus({
      tone: "saving",
      label: "Sending...",
      detail: "Dispatching contact inquiry",
      durationMs: 0,
    });

    if (!isOnline) {
      queueAndResetForm();
      return;
    }

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (res.status === 503) {
        queueAndResetForm();
        return;
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to submit message.");
      }

      trackEvent("contact_click", "Contact Form Submission");
      setStatus("success");
      setSubmitAttempted(false);
      announceBrandPortalStatus({
        tone: "live",
        label: "Message Sent",
        detail: "Delivered directly to inbox",
        durationMs: 3600,
      });
      setFormData({
        name: "",
        email: "",
        subject: "",
        message: "",
        honeypot: "",
      });
    } catch (err: unknown) {
      if (err instanceof TypeError) {
        // Offline or network unreachable during fetch: queue locally instead of dropping
        queueAndResetForm();
        return;
      }

      setStatus("error");
      const msg =
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again or email directly.";
      setErrorMessage(msg);
      announceBrandPortalStatus({
        tone: "error",
        label: "Send Failed",
        detail: msg,
      });
    }
  };

  return (
    <section
      id="contact"
      aria-label="Contact Section"
      className="scroll-mt-16 w-full py-16 sm:py-24 lg:py-32 px-4 sm:px-6 md:px-10 bg-(--bg-canvas)"
    >
      <div className="max-w-7xl mx-auto flex flex-col gap-12 sm:gap-16">
        {/* Header */}
        <div>
          <Eyebrow withDot className="mb-3">
            {sectionHeaders.contactEyebrow}
          </Eyebrow>
          <DisplayHeading as="h2" size="xl" className="max-w-4xl">
            {sectionHeaders.contactHeading}
          </DisplayHeading>
          <BodyText size="md" tone="secondary" className="max-w-xl mt-5 sm:mt-6">
            {sectionHeaders.contactSubtitle}
          </BodyText>

          {/* Responsive Magnetic Mailto Hero Link */}
          <div className="mt-6 sm:mt-8">
            <a
              href={`mailto:${profile.contact.email}`}
              onClick={() => trackEvent("contact_click", "Direct Email Click")}
              className="group inline-flex flex-wrap items-center gap-2 sm:gap-3 font-display text-lg sm:text-2xl md:text-4xl text-(--text-primary) hover:text-(--text-accent) transition-colors break-all sm:break-normal"
            >
              <Mail className="w-5 h-5 sm:w-6 sm:h-6 text-(--text-accent) shrink-0" />
              <span className="underline underline-offset-8 decoration-(--border-strong) group-hover:decoration-(--text-accent)">
                {profile.contact.email}
              </span>
              <ArrowUpRight className="w-5 h-5 sm:w-6 sm:h-6 text-(--text-accent) group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform shrink-0" />
            </a>
          </div>
        </div>

        {/* Form Container */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 sm:gap-12 pt-10 sm:pt-12 border-t border-(--border-subtle)">
          <div className="lg:col-span-5 flex flex-col justify-between gap-6">
            <div>
              <DisplayHeading as="h3" size="sm">
                {sectionHeaders.contactFormTitle}
              </DisplayHeading>
              <BodyText size="xs" tone="secondary" className="mt-2">
                {sectionHeaders.contactFormSubtitle}
              </BodyText>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
              <div className="p-4 rounded-sm bg-(--bg-surface) border border-(--border-subtle) shadow-sm">
                <MonoLabel as="span" tone="muted" className="block">
                  Location
                </MonoLabel>
                <BodyText
                  as="span"
                  size="sm"
                  tone="primary"
                  className="mt-1 block"
                >
                  {profile.contact.location} (Open to Remote & On-Site)
                </BodyText>
              </div>
              <div className="p-4 rounded-sm bg-(--bg-surface) border border-(--border-subtle) shadow-sm">
                <MonoLabel as="span" tone="muted" className="block">
                  Availability
                </MonoLabel>
                <span className="text-xs sm:text-sm font-medium text-(--text-success) mt-1 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-(--text-success) animate-pulse shrink-0" />
                  <span>{profile.contact.status}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Interactive Form Using Reusable Validated Field Partials */}
          <div className="lg:col-span-7 bg-(--bg-surface) p-5 sm:p-8 md:p-10 rounded-(--radius-card) border border-(--border-subtle) shadow-xl">
            {status === "success" ? (
              <div className="py-10 sm:py-12 flex flex-col items-center justify-center text-center">
                <div className="w-14 h-14 rounded-full bg-(--bg-badge-highlight) border border-brand flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-7 h-7 text-(--text-accent)" />
                </div>
                <DisplayHeading as="h4" size="md">
                  Message Dispatched!
                </DisplayHeading>
                <BodyText size="xs" tone="secondary" className="max-w-sm mt-2">
                  Thank you for reaching out. Your message is now stored in the Portfolio Management Inbox.
                </BodyText>
                <Button
                  onClick={() => setStatus("idle")}
                  variant="outline"
                  size="sm"
                  className="mt-6"
                >
                  Send Another Message
                </Button>
              </div>
            ) : status === "queued" ? (
              <div className="py-10 sm:py-12 flex flex-col items-center justify-center text-center">
                <div className="w-14 h-14 rounded-full bg-amber-500/15 border border-amber-500/40 flex items-center justify-center mb-4">
                  <Clock className="w-7 h-7 text-amber-400" />
                </div>
                <DisplayHeading as="h4" size="md">
                  Saved to Offline Outbox
                </DisplayHeading>
                <BodyText size="xs" tone="secondary" className="max-w-sm mt-2">
                  You appear to be offline or the server is temporarily unreachable. Your message is safely saved in this browser and will transmit automatically as soon as connectivity returns.
                </BodyText>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <Button
                    onClick={() => setStatus("idle")}
                    variant="outline"
                    size="sm"
                  >
                    Compose Another
                  </Button>
                  <a
                    href={`mailto:${profile.contact.email}`}
                    className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-(--text-accent) hover:underline"
                  >
                    <span>Email Directly</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                noValidate
                autoComplete="off"
                className="flex flex-col gap-5 sm:gap-6"
              >
                {/* Honeypot field (hidden from real users) */}
                <input
                  type="text"
                  name="honeypot"
                  value={formData.honeypot}
                  onChange={(e) =>
                    setFormData({ ...formData, honeypot: e.target.value })
                  }
                  tabIndex={-1}
                  autoComplete="off"
                  className="hidden"
                  aria-hidden="true"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
                  <NameField
                    id="contact-name"
                    label="Your Name"
                    placeholder="e.g. Alex Mercer"
                    value={formData.name}
                    forceTouched={submitAttempted}
                    onChange={(name) => {
                      setFormData({ ...formData, name });
                      if (status === "error") setStatus("idle");
                    }}
                  />

                  <EmailField
                    id="contact-email"
                    label="Your Email"
                    placeholder="e.g. alex@company.com"
                    value={formData.email}
                    forceTouched={submitAttempted}
                    onChange={(email) => {
                      setFormData({ ...formData, email });
                      if (status === "error") setStatus("idle");
                    }}
                  />
                </div>

                <SubjectField
                  id="contact-subject"
                  label="Subject / Project Topic"
                  placeholder="e.g. Full-Stack Engineering Role / Interview"
                  value={formData.subject}
                  forceTouched={submitAttempted}
                  onChange={(subject) => {
                    setFormData({ ...formData, subject });
                    if (status === "error") setStatus("idle");
                  }}
                />

                <MessageField
                  id="contact-message"
                  label="Message"
                  rows={4}
                  placeholder="Tell me about your system, project, or opportunity (min. 10 characters)..."
                  value={formData.message}
                  forceTouched={submitAttempted}
                  onChange={(message) => {
                    setFormData({ ...formData, message });
                    if (status === "error") setStatus("idle");
                  }}
                />

                {status === "error" && (
                  <p className="text-xs text-(--text-accent) bg-(--bg-badge-highlight) border border-brand/30 p-3 rounded-(--radius-control) font-medium">
                    {errorMessage}
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={status === "loading"}
                  variant="primary"
                  size="lg"
                  fullWidth
                >
                  {status === "loading" ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Transmitting...</span>
                    </>
                  ) : (
                    <>
                      <span>Transmit Message</span>
                      <Send className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
