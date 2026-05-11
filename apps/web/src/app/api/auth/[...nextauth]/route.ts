import { NextResponse } from "next/server";
import { handlers } from "@/auth";

type AuthHandler = (request: Request) => Promise<Response>;

const authHandlers = handlers as {
  GET: AuthHandler;
  POST: AuthHandler;
};

function getAuthFailureRedirect(request: Request) {
  const url = new URL(request.url);

  url.pathname = "/";
  url.search = "";
  url.searchParams.set(
    "error",
    "Sign-in failed. Please try again in a moment."
  );

  return NextResponse.redirect(url);
}

async function safelyHandleAuthRequest(
  request: Request,
  handler: AuthHandler
) {
  try {
    return await handler(request);
  } catch (error) {
    console.error("Project-A auth route failed", error);

    if (request.method === "GET") {
      return getAuthFailureRedirect(request);
    }

    return NextResponse.json(
      {
        error: "Authentication request failed. Please try again in a moment.",
      },
      { status: 503 }
    );
  }
}

export async function GET(request: Request) {
  return safelyHandleAuthRequest(request, authHandlers.GET);
}

export async function POST(request: Request) {
  return safelyHandleAuthRequest(request, authHandlers.POST);
}
