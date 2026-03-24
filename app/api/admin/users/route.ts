import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/admin/users — 사용자 + 권한 목록
export async function GET() {
  try {
    const users = await prisma.user.findMany({
      include: { permission: true },
      orderBy: { id: "asc" },
    });

    const yn = (v: string | null | undefined, def: string) => (v ?? def) === "Y";

    return NextResponse.json(users.map((u) => {
      const p = u.permission;
      return {
        id:       u.id,
        name:     u.name,
        email:    u.email,
        role:     u.role,
        isActive: u.isActive === "Y",
        perms: {
          main:              yn(p?.canViewMain,              "Y"),
          status:            yn(p?.canViewStatus,            "Y"),
          period:            yn(p?.canViewPeriod,            "Y"),
          userPerm:          yn(p?.canViewUserPerm,          "N"),
          targetUsage:       yn(p?.canViewTargetUsage,       "Y"),
          barcode:           yn(p?.canViewBarcode,           "Y"),
          barcodeCreatePrint:yn(p?.canViewBarcodeCreatePrint,"Y"),
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
    const { users } = body;

    if (!Array.isArray(users)) {
      return NextResponse.json({ error: "users 배열 필요" }, { status: 400 });
    }

    const toYN = (v: boolean | undefined, def: boolean) => ((v ?? def) ? "Y" : "N");

    for (const u of users) {
      await prisma.user.update({
        where: { id: u.id },
        data:  { role: u.role, isActive: toYN(u.isActive, true) },
      });

      const perms = {
        canViewMain:              toYN(u.perms.main,              true),
        canViewStatus:            toYN(u.perms.status,            true),
        canViewPeriod:            toYN(u.perms.period,            true),
        canViewUserPerm:          toYN(u.perms.userPerm,          false),
        canViewTargetUsage:       toYN(u.perms.targetUsage,       true),
        canViewBarcode:           toYN(u.perms.barcode,           true),
        canViewBarcodeCreatePrint:toYN(u.perms.barcodeCreatePrint,true),
      };

      await prisma.userTabPermission.upsert({
        where:  { userId: u.id },
        update: perms,
        create: { userId: u.id, ...perms },
      });
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

    if (!name) {
      return NextResponse.json({ error: "이름은 필수입니다." }, { status: 400 });
    }

    if (email) {
      const exists = await prisma.user.findUnique({ where: { email } });
      if (exists) {
        return NextResponse.json({ error: "이미 등록된 이메일입니다." }, { status: 409 });
      }
    }

    const user = await prisma.user.create({
      data: { name, email: email || null, role: role || "viewer", isActive: "Y" },
    });

    await prisma.userTabPermission.create({
      data: { userId: user.id },
    });

    return NextResponse.json({
      id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive,
    }, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/users error:", error);
    return NextResponse.json({ error: "사용자 추가 실패" }, { status: 500 });
  }
}
