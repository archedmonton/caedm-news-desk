import { NextResponse, type NextRequest } from "next/server";

// UX-only redirect. Real authorization happens server-side in every page and action (requireUser).
export function middleware(req: NextRequest) {
  if (!req.cookies.get("newsdesk_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // API routes authenticate themselves (session, or CRON_SECRET for the scheduler).
  matcher: ["/((?!login|invite|api/|_next/static|_next/image|favicon.ico).*)"],
};
