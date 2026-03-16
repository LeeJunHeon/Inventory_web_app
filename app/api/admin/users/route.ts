import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const RESOURCE_KEYS = ["inventory", "status", "period", "target", "barcode", "barcode_create", "admin"] as const;

// GET /api/admin/users — 사용자 + 권한 목록
export async function GET() {
  try {
    const users = await prisma.user.findMany({
      include: { permissions: true },
      orderBy: { id: "asc" },
    });

    return NextResponse.json(users.map((u) => {
      const permMap: Record<string, boolean> = {};
      for (const key of RESOURCE_KEYS) {
        const perm = u.permissions.find((p) => p.resource === key);
        permMap[key] = perm?.canEdit ?? false;
      }
      return {
        id:       u.id,
        name:     u.name,
        email:    u.email,
        role:     u.role,
        isActive: u.isActive,
        perms: {
          inventory:     permMap["inventory"]      ?? true,
          status:        permMap["status"]         ?? true,
          period:        permMap["period"]         ?? false,
          target:        permMap["target"]         ?? false,
          barcode:       permMap["barcode"]        ?? false,
          barcodeCreate: permMap["barcode_create"] ?? false,
          admin:         permMap["admin"]          ?? false,
        },
      };
    }));
  } catch (error) {
    console.error("GET /api/admin/users error:", error);
    return NextResponse.json({ error: "사용자 조회 실패" }, { status: 500 });
  }
}

// PUT /api/admin/users — 사용자 권한/역할/활성 일괄 저장
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    // body: { users: Array<{ id, role, isActive, perms }> }
    const { users } = body;

    if (!Array.isArray(users)) {
      return NextResponse.json({ error: "users 배열 필요" }, { status: 400 });
    }

    for (const u of users) {
      // 역할/활성 업데이트
      await prisma.user.update({
        where: { id: u.id },
        data:  { role: u.role, isActive: u.isActive },
      });

      // 권한 upsert
      const permEntries: { resource: string; canEdit: boolean }[] = [
        { resource: "inventory",     canEdit: u.perms.inventory     ?? false },
        { resource: "status",        canEdit: u.perms.status        ?? false },
        { resource: "period",        canEdit: u.perms.period        ?? false },
        { resource: "target",        canEdit: u.perms.target        ?? false },
        { resource: "barcode",       canEdit: u.perms.barcode       ?? false },
        { resource: "barcode_create",canEdit: u.perms.barcodeCreate ?? false },
        { resource: "admin",         canEdit: u.perms.admin         ?? false },
      ];

      for (const pe of permEntries) {
        await prisma.userPermission.upsert({
          where:  { userId_resource: { userId: u.id, resource: pe.resource } },
          update: { canEdit: pe.canEdit, canView: true },
          create: { userId: u.id, resource: pe.resource, canView: true, canEdit: pe.canEdit },
        });
      }
    }

    return NextResponse.json({ message: "저장 완료" });
  } catch (error) {
    console.error("PUT /api/admin/users error:", error);
    return NextResponse.json({ error: "저장 실패" }, { status: 500 });
  }
}

// POST /api/admin/users — 사용자 추가
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, role } = body;

    if (!name || !email) {
      return NextResponse.json({ error: "이름과 이메일은 필수입니다." }, { status: 400 });
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      return NextResponse.json({ error: "이미 등록된 이메일입니다." }, { status: 409 });
    }

    const user = await prisma.user.create({
      data: { name, email, role: role || "employee", isActive: true },
    });

    // 기본 권한 생성 (inventory, status 보기 권한)
    await prisma.userPermission.createMany({
      data: [
        { userId: user.id, resource: "inventory",  canView: true, canEdit: false },
        { userId: user.id, resource: "status",     canView: true, canEdit: false },
      ],
    });

    return NextResponse.json({ id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive }, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/users error:", error);
    return NextResponse.json({ error: "사용자 추가 실패" }, { status: 500 });
  }
}
