import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, Share2, UserPlus, Users } from "lucide-react";
import { GRANT_NAME_MAX_LENGTH, type AccessGrant, type CreatedGrant } from "@shared/access";
import {
  ACCESS_GRANTS_KEY,
  AccessApiError,
  createGrant,
  fetchGrants,
  revokeGrant,
} from "@/lib/access-client";
import { qrPath } from "@/lib/qr";
import { t, type Language } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Validity choices in days; "0" stands for no expiry. */
const VALIDITY = ["0", "30", "365"] as const;
type Validity = (typeof VALIDITY)[number];

export const ACCESS_HASH = "#access";

function format(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}

function errorText(error: unknown, language: Language): string {
  if (error instanceof AccessApiError && error.code === "ACCESS_STORE_MISSING") return t("access.error.store", language);
  return t("access.error.generic", language);
}

/**
 * "Share access" for the admin: invite someone by name, show the link as a QR code or share it, and revoke
 * invitations from the list. Only rendered when /api/access/me reports the admin.
 */
export function AccessShareSection({ language }: { language: Language }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [validity, setValidity] = useState<Validity>("0");
  const [created, setCreated] = useState<CreatedGrant | null>(null);
  const [toRevoke, setToRevoke] = useState<AccessGrant | null>(null);

  const grants = useQuery({ queryKey: ACCESS_GRANTS_KEY, queryFn: fetchGrants, staleTime: 0 });

  const create = useMutation({
    mutationFn: () => createGrant({ name: name.trim(), validDays: validity === "0" ? null : Number(validity) }),
    onSuccess: (result) => {
      setCreated(result);
      setName("");
      void queryClient.invalidateQueries({ queryKey: ACCESS_GRANTS_KEY });
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeGrant(id),
    onSuccess: (_result, id) => {
      queryClient.setQueryData<AccessGrant[]>(ACCESS_GRANTS_KEY, (list) => list?.filter((grant) => grant.id !== id));
    },
    onSettled: () => setToRevoke(null),
  });

  const locale = language === "de" ? "de-DE" : "en-GB";
  const date = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "numeric", year: "numeric" });

  return (
    <Card id="access" className="bg-card border-border/70 shadow-sm rounded-xl scroll-mt-[calc(7.5rem+var(--safe-top))]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="w-4 h-4 text-muted-foreground" /> {t("access.title", language)}
        </CardTitle>
        <CardDescription>{t("access.desc", language)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form
          className="flex flex-col sm:flex-row gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim() && !create.isPending) create.mutate();
          }}
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={GRANT_NAME_MAX_LENGTH}
            placeholder={t("access.name.placeholder", language)}
            aria-label={t("access.name", language)}
            autoComplete="off"
            className="h-10 rounded-lg bg-card sm:flex-1"
          />
          <div className="flex gap-2">
            <Select value={validity} onValueChange={(value) => setValidity(value as Validity)}>
              <SelectTrigger className="h-10 flex-1 sm:w-36" aria-label={t("access.validity", language)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VALIDITY.map((value) => (
                  <SelectItem key={value} value={value}>{t(`access.validity.${value}`, language)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" className="h-10" disabled={!name.trim() || create.isPending}>
              {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("access.invite", language)}
            </Button>
          </div>
        </form>
        {create.isError && <p className="text-sm text-destructive">{errorText(create.error, language)}</p>}

        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Users className="w-4 h-4 text-muted-foreground" />
            {format(t("access.list.title", language), { count: String(grants.data?.length ?? 0) })}
          </h3>
          {grants.isLoading && <p className="text-sm text-muted-foreground">{t("access.list.loading", language)}</p>}
          {grants.isError && <p className="text-sm text-destructive">{errorText(grants.error, language)}</p>}
          {grants.data?.length === 0 && <p className="text-sm text-muted-foreground">{t("access.list.empty", language)}</p>}
          {!!grants.data?.length && (
            <ul className="divide-y divide-border/70 rounded-lg border border-border/70">
              {grants.data.map((grant) => (
                <li key={grant.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{grant.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        format(t("access.list.since", language), { date: date(grant.createdAt) }),
                        grant.lastUsedAt
                          ? format(t("access.list.used", language), { date: date(grant.lastUsedAt) })
                          : t("access.list.unused", language),
                        grant.expiresAt ? format(t("access.list.until", language), { date: date(grant.expiresAt) }) : null,
                      ].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 text-destructive hover:text-destructive"
                    onClick={() => setToRevoke(grant)}
                  >
                    {t("access.revoke", language)}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {revoke.isError && <p className="text-sm text-destructive">{errorText(revoke.error, language)}</p>}
        </div>
      </CardContent>

      <InviteDialog created={created} onClose={() => setCreated(null)} language={language} date={date} />

      <AlertDialog open={!!toRevoke} onOpenChange={(open) => !open && !revoke.isPending && setToRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{format(t("access.revoke.title", language), { name: toRevoke?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{format(t("access.revoke.desc", language), { name: toRevoke?.name ?? "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoke.isPending}>{t("access.cancel", language)}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={revoke.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (toRevoke) revoke.mutate(toRevoke.id);
              }}
            >
              {revoke.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("access.revoke", language)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

/** The new invitation: QR code to scan on the spot, or the link to share or copy. Shown only this once. */
function InviteDialog({
  created,
  onClose,
  language,
  date,
}: {
  created: CreatedGrant | null;
  onClose: () => void;
  language: Language;
  date: (iso: string) => string;
}) {
  const [copied, setCopied] = useState(false);
  const qr = useMemo(() => (created ? qrPath(created.link) : null), [created]);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const name = created?.grant.name ?? "";

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused (e.g. not allowed in this browser): the link stays visible for copying by hand.
    }
  };

  const share = async () => {
    if (!created) return;
    try {
      await navigator.share({
        title: "Pendel-Pilot",
        text: format(t("access.share.text", language), { name }),
        url: created.link,
      });
    } catch {
      // Cancelled by the user.
    }
  };

  return (
    <Dialog open={!!created} onOpenChange={(open) => { if (!open) { setCopied(false); onClose(); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{format(t("access.created.title", language), { name })}</DialogTitle>
          <DialogDescription>{format(t("access.created.desc", language), { name })}</DialogDescription>
        </DialogHeader>
        {created && qr && (
          <div className="space-y-4">
            {/* Always dark on white, also in dark mode: scanners expect that contrast. */}
            <div className="mx-auto w-full max-w-[16rem] rounded-xl bg-white p-3">
              <svg
                viewBox={`-2 -2 ${qr.size + 4} ${qr.size + 4}`}
                className="block w-full h-auto"
                shapeRendering="crispEdges"
                role="img"
                aria-label={t("access.created.qr", language)}
              >
                <rect x={-2} y={-2} width={qr.size + 4} height={qr.size + 4} fill="#fff" />
                <path d={qr.path} fill="#000" />
              </svg>
            </div>
            <p className="break-all rounded-lg bg-muted/50 px-3 py-2 font-mono text-xs select-all">{created.link}</p>
            <div className="flex gap-2">
              {canShare && (
                <Button type="button" className="flex-1" onClick={() => void share()}>
                  <Share2 className="w-4 h-4 mr-2" /> {t("access.share", language)}
                </Button>
              )}
              <Button type="button" variant={canShare ? "outline" : "default"} className="flex-1" onClick={() => void copy()}>
                {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                {copied ? t("access.copied", language) : t("access.copy", language)}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {created.grant.expiresAt
                ? format(t("access.created.until", language), { date: date(created.grant.expiresAt) })
                : t("access.created.forever", language)}
              {" "}{t("access.created.once", language)}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
