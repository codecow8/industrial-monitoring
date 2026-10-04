"""Provision an account without storing its plaintext password."""
import argparse
import getpass
import re
import secrets

from sqlalchemy import select

from .auth import hash_password
from .database import SessionFactory
from .models import AuthUser


def main() -> None:
    parser = argparse.ArgumentParser(description="创建工业监控登录账号")
    parser.add_argument("username")
    parser.add_argument("--generate", action="store_true", help="生成随机初始密码并仅输出一次")
    args = parser.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,64}", args.username):
        parser.error("账号限 1–64 位字母、数字、点、下划线或连字符")
    with SessionFactory.begin() as session:
        if session.scalar(select(AuthUser).where(AuthUser.username == args.username)):
            parser.error("账号已存在；不会覆盖原账号或密码")
        password = secrets.token_urlsafe(18) if args.generate else getpass.getpass("密码（至少 12 位）：")
        if len(password) < 12 or len(password) > 256:
            parser.error("密码长度应为 12–256 位")
        if not args.generate and password != getpass.getpass("确认密码："):
            parser.error("两次密码不一致")
        session.add(AuthUser(username=args.username, password_hash=hash_password(password)))
    print(f"已创建账号：{args.username}")
    if args.generate:
        print(f"初始密码：{password}")


if __name__ == "__main__":
    main()
