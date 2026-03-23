import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/admin/users — 사용자 + 권한 목록
export async function GET() {
  try {
    const users = await prisma.user.findMany({
      include: { permission: true },
      orderBy: { id: "asc" },
    });

    return NextResponse.json(users.map((u) => {
      const p = u.permission;
      return {
        id:       u.id,
        name:     u.name,
        email:    u.email,
        role:     u.role,
        isActive: u.isActive,
        perms: {
          main:              p?.canViewMain              ?? "Y",
          status:            p?.canViewStatus            ?? "Y",
          period:            p?.canViewPeriod            ?? "Y",
          userPerm:          p?.canViewUserPerm          ?? "N",
          targetUsage:       p?.canViewTargetUsage       ?? "Y",
          barcode:           p?.canViewBarcode           ?? "Y",
          barcodeCreatePrint:p?.canViewBarcodeCreatePrint ?? "Y",
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

    for (const u of users) {
      await prisma.user.update({
        where: { id: u.id },
        data:  { role: u.role, isActive: u.isActive },
      });

      await prisma.userTabPermission.upsert({
        where:  { userId: u.id },
        update: {
          canViewMain:              u.perms.main              ?? "Y",
          canViewStatus:            u.perms.status            ?? "Y",
          canViewPeriod:            u.perms.period            ?? "Y",
          canViewUserPerm:          u.perms.userPerm          ?? "N",
          canViewTargetUsage:       u.perms.targetUsage       ?? "Y",
          canViewBarcode:           u.perms.barcode           ?? "Y",
          canViewBarcodeCreatePrint:u.perms.barcodeCreatePrint ?? "Y",
        },
        create: {
          userId:                   u.id,
          canViewMain:              u.perms.main              ?? "Y",
          canViewStatus:            u.perms.status            ?? "Y",
          canViewPeriod:            u.perms.period            ?? "Y",
          canViewUserPerm:          u.perms.userPerm          ?? "N",
          canViewTargetUsage:       u.perms.targetUsage       ?? "Y",
          canViewBarcode:           u.perms.barcode           ?? "Y",
          canViewBarcodeCreatePrint:u.perms.barcodeCreatePrint ?? "Y",
        },
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
