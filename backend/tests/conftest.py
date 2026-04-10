import os

# Must be set before app modules are imported
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production")
