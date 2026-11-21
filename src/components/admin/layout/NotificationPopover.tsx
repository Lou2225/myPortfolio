"use client";

import { ContactMessage, AnalyticsEvent } from "@/types/portfolio";
import { AdminTab } from "./types";
import { DropdownPopover } from "@/components/ui/DropdownPopover";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { BadgeCounter } from "@/components/ui/BadgeCounter";
import { Button } from "@/components/ui/Button";
import { Magnetic } from "@/components/motion/Magnetic";
import { Tooltip, TruncatedText } from "@/components/ui/Tooltip";
import { Bell, Mail, Activity, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NotificationPopoverProps {
  messages: ContactMessage[];
  analytics: AnalyticsEvent[];
  onNavigateTab: (tab: AdminTab) => void;
}

export function NotificationPopover({
  messages,
  analytics,
  onNavigateTab,
}: NotificationPopoverProps) {
  const unreadMessages = messages.filter((m) => !m.isRead);
  const recentAnalytics = analytics.slice(0, 4);
  const unreadCount = unreadMessages.length;

  return (
    <DropdownPopover
      portal
      align="end"
      minWidth={320}
      estimatedHeight={380}
      overflowMode="clip"
      trigger={({ isOpen, toggle }) => (
        <Magnetic strength={0.2}>
          <button
            type="button"
            onClick={toggle}
            aria-label={`Notifications (${unreadCount} unread)`}
            aria-expanded={isOpen}
            title="Notifications & Activity"
            className={cn(
              "relative h-8.5 w-8.5 rounded-full border inline-flex items-center justify-center transition-all duration-300 active:scale-95 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
              isOpen
                ? "border-brand bg-(--bg-badge-highlight) text-(--text-accent)"
                : "border-(--border-strong) bg-(--bg-surface-2)/60 text-(--text-primary) hover:border-brand hover:text-(--text-accent)"
            )}
          >
            <Bell className="w-3.5 h-3.5" />
            {unreadCount > 0 && (
              <BadgeCounter
                count={unreadCount}
                max={9}
                variant="alert"
                size="xs"
                floating
              />
            )}
          </button>
        </Magnetic>
      )}
    >
      {({ close }) => (
        <div className="divide-y divide-(--border-subtle)">
          {/* Header */}
          <div className="px-4 py-3 flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-(--text-primary) block">
                Notifications
              </span>
              <span className="text-[10px] font-mono text-(--text-muted)">
                Inbox inquiries & live telemetry
              </span>
            </div>
            <span
              className={cn(
                "text-[10px] font-mono uppercase tracking-[0.14em] shrink-0",
                unreadCount > 0
                  ? "text-(--text-accent) font-semibold"
                  : "text-(--text-muted)"
              )}
            >
              {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
            </span>
          </div>

          {/* Scrollable Notification Feed */}
          <ScrollArea
            maxHeight="min(300px, calc(100dvh - 14rem))"
            className="divide-y divide-(--border-subtle)"
          >
            {unreadMessages.length > 0 ? (
              <div className="p-2 space-y-1">
                <p className="px-2 py-1 text-[9px] font-mono uppercase tracking-[0.2em] text-(--text-accent) font-semibold">
                  Unread Inquiries
                </p>
                {unreadMessages.slice(0, 4).map((msg) => (
                  <button
                    key={msg.id}
                    type="button"
                    onClick={() => {
                      onNavigateTab("inbox");
                      close();
                    }}
                    className="w-full text-left p-2.5 rounded-lg hover:bg-(--bg-surface-2) transition-colors flex items-start gap-3 cursor-pointer group"
                  >
                    <div className="w-8 h-8 rounded-full bg-(--bg-badge-highlight) border border-brand/30 flex items-center justify-center shrink-0 mt-0.5">
                      <Mail className="w-3.5 h-3.5 text-(--text-accent)" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <TruncatedText
                          text={msg.name}
                          className="text-xs font-semibold text-(--text-primary) group-hover:text-(--text-accent) transition-colors"
                        />
                        <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0" />
                      </div>
                      <TruncatedText
                        as="p"
                        text={msg.subject}
                        className="text-[11px] font-medium text-(--text-secondary)"
                      />
                      <TruncatedText
                        as="p"
                        text={msg.message}
                        clampClassName="line-clamp-1"
                        className="text-[10px] text-(--text-muted) mt-0.5"
                      />
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-4 py-5 text-center">
                <p className="text-xs text-(--text-secondary) font-medium">
                  No unread inbox messages
                </p>
                <p className="text-[11px] text-(--text-muted) mt-0.5">
                  New contact form submissions will appear here.
                </p>
              </div>
            )}

            {/* Recent Telemetry Activity */}
            {recentAnalytics.length > 0 && (
              <div className="p-2 space-y-1">
                <p className="px-2 py-1 text-[9px] font-mono uppercase tracking-[0.2em] text-(--text-muted)">
                  Recent Visitor Telemetry
                </p>
                {recentAnalytics.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => {
                      onNavigateTab("overview");
                      close();
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-(--bg-surface-2) transition-colors flex items-center gap-2.5 cursor-pointer"
                  >
                    <Activity className="w-3.5 h-3.5 text-(--text-accent) shrink-0" />
                    <div className="min-w-0 flex-1">
                      <Tooltip
                        content={`${ev.type.replace("_", " ").toUpperCase()} — ${ev.target}`}
                        onlyWhenTruncated
                      >
                        <p className="text-[11px] text-(--text-primary) truncate">
                          <span className="font-mono uppercase text-[10px] text-(--text-accent) mr-1.5">
                            {ev.type.replace("_", " ")}
                          </span>
                          {ev.target}
                        </p>
                      </Tooltip>
                    </div>
                    <span className="text-[9px] font-mono text-(--text-muted) shrink-0">
                      {new Date(ev.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Footer Action */}
          <div className="p-2 bg-(--bg-surface-2)/40">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              fullWidth
              onClick={() => {
                onNavigateTab("inbox");
                close();
              }}
              className="text-[11px] font-mono"
            >
              <span>View All Inbox Messages ({messages.length})</span>
              <ArrowRight className="w-3.5 h-3.5 text-(--text-accent)" />
            </Button>
          </div>
        </div>
      )}
    </DropdownPopover>
  );
}
