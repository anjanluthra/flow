import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })

  // All /auth/* pages (login + set-password from an invite) are public.
  const isAuthPage = request.nextUrl.pathname.startsWith('/auth/')
  const isApiAuth = request.nextUrl.pathname.startsWith('/api/auth')
  // Household photos are shown on the (unauthenticated) login page.
  const isPublicPhoto = request.nextUrl.pathname.startsWith('/api/couple-photo')

  // Allow auth-related and public routes
  if (isApiAuth || isPublicPhoto) {
    return NextResponse.next()
  }

  // Redirect authenticated users away from login
  if (isAuthPage && token) {
    return NextResponse.redirect(new URL('/home', request.url))
  }

  // Redirect unauthenticated users to login
  if (!isAuthPage && !token) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next|favicon\\.ico|.*\\.svg|.*\\.png|.*\\.jpg|.*\\.ico).*)',
  ],
}
