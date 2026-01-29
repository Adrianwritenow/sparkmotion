import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@sparkmotion/database";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const validated = loginSchema.safeParse(body);

  if (!validated.success) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const { email, password } = validated.data;
  const user = await db.user.findUnique({
    where: { email },
    include: {
      orgUsers: {
        take: 1,
        orderBy: { id: "asc" },
      },
    },
  });

  if (!user || !user.password) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    orgId: user.orgUsers[0]?.orgId ?? null,
  });
}
