"use client";

import { Badge } from "@/components/ui/badge";
import { Zap, Clock, AlertTriangle, XCircle } from "lucide-react";
import Link from "next/link";

interface Props {
  user: { name: string; email: string };
  subscription: {
    status: string;
    planName: string | null;
    trialDaysLeft: number | null;
  };
  creditBalance: number;
}

function SubscriptionBadge({ status, planName, trialDaysLeft }: Props["subscription"]) {
  if (status === "TRIALING") {
    return (
      <Link href="/settings/billing">
        <Badge variant="warning" className="cursor-pointer hover:opacity-80 gap-1.5">
          <Clock className="w-3 h-3" />
          Trial — {trialDaysLeft ?? 0}d left
        </Badge>
      </Link>
    );
  }
  if (status === "ACTIVE") {
    return (
      <Badge variant="success" className="gap-1.5">
        <Zap className="w-3 h-3" />
        {planName ?? "Active"}
      </Badge>
    );
  }
  if (status === "PAST_DUE") {
    return (
      <Link href="/settings/billing">
        <Badge variant="danger" className="cursor-pointer hover:opacity-80 gap-1.5 animate-pulse">
          <AlertTriangle className="w-3 h-3" />
          Payment Failed
        </Badge>
      </Link>
    );
  }
  if (status === "CANCELLED") {
    return (
      <Link href="/settings/billing">
        <Badge variant="danger" className="cursor-pointer hover:opacity-80 gap-1.5">
          <XCircle className="w-3 h-3" />
          Cancelled
        </Badge>
      </Link>
    );
  }
  return null;
}

export default function DashboardHeader({ user, subscription, creditBalance }: Props) {
  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3.5 flex items-center justify-between flex-shrink-0">
      {/* Left — subscription status */}
      <SubscriptionBadge {...subscription} />

      {/* Right — credits + user */}
      <div className="flex items-center gap-4">
        {/* Credit balance */}
        <Link
          href="/settings/billing"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
        >
          <Zap className="w-3.5 h-3.5 text-blue-600" />
          <span className="text-sm font-semibold text-blue-700">
            {creditBalance} credits
          </span>
        </Link>

        {/* User avatar */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-semibold">
              {user.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-gray-900 leading-none">
              {user.name}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{user.email}</p>
          </div>
        </div>
      </div>
    </header>
  );
}