# THE QP - Makefile for Docker commands

.PHONY: help build up down logs shell clean test prod-build prod-up

# Default target
help:
	@echo "THE QP - Docker Commands"
	@echo ""
	@echo "Development:"
	@echo "  make build      - Build development images"
	@echo "  make up         - Start development environment"
	@echo "  make down       - Stop development environment"
	@echo "  make logs       - View logs"
	@echo "  make shell      - Shell into app container"
	@echo "  make db-shell   - PostgreSQL shell"
	@echo "  make test       - Run tests"
	@echo ""
	@echo "Production:"
	@echo "  make prod-build - Build production images"
	@echo "  make prod-up    - Start production environment"
	@echo "  make prod-down  - Stop production environment"
	@echo ""
	@echo "Utilities:"
	@echo "  make clean      - Clean up volumes and images"
	@echo "  make reset-db   - Reset database"
	@echo "  make backup-db  - Backup database"

# Development commands
build:
	docker-compose build

up:
	docker-compose up -d
	@echo "✅ Development environment started!"
	@echo ""
	@echo "Services:"
	@echo "  - App:           http://localhost:3000"
	@echo "  - Mailhog:       http://localhost:8025"
	@echo "  - pgAdmin:       http://localhost:5050"
	@echo "  - Redis Commander: http://localhost:8081"
	@echo ""
	@echo "Mars Reservation: http://localhost:3000/mars 🚀"

down:
	docker-compose down

logs:
	docker-compose logs -f app

shell:
	docker-compose exec app sh

db-shell:
	docker-compose exec postgres psql -U qpuser -d qpdb

test:
	docker-compose exec app npm test

# Production commands
prod-build:
	docker-compose -f docker-compose.prod.yml build

prod-up:
	@test -n "$(DATABASE_URL)" || (echo "❌ DATABASE_URL not set" && exit 1)
	@test -n "$(JWT_SECRET)" || (echo "❌ JWT_SECRET not set" && exit 1)
	@test -n "$(STRIPE_SECRET_KEY)" || (echo "❌ STRIPE_SECRET_KEY not set" && exit 1)
	@test -n "$(BITCOIN_XPUB)" || (echo "❌ BITCOIN_XPUB not set" && exit 1)
	@test -n "$(DOGECOIN_XPUB)" || (echo "❌ DOGECOIN_XPUB not set" && exit 1)
	docker-compose -f docker-compose.prod.yml up -d
	@echo "✅ Production environment started!"

prod-down:
	docker-compose -f docker-compose.prod.yml down

# Utility commands
clean:
	docker-compose down -v
	docker system prune -f

reset-db:
	docker-compose exec postgres psql -U qpuser -d qpdb -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
	docker-compose exec postgres psql -U qpuser -d qpdb -f /docker-entrypoint-initdb.d/01-schema.sql
	docker-compose exec postgres psql -U qpuser -d qpdb -f /docker-entrypoint-initdb.d/02-mars.sql
	@echo "✅ Database reset complete!"

backup-db:
	@mkdir -p backups
	docker-compose exec -T postgres pg_dump -U qpuser qpdb > backups/qpdb-$$(date +%Y%m%d-%H%M%S).sql
	@echo "✅ Database backed up to backups/"

# Monitor logs
monitor-logs:
	docker-compose logs -f bitcoin-monitor dogecoin-monitor

# Check health
health:
	@curl -s http://localhost:3000/health | jq '.'

# Initialize Mars reservation
init-mars:
	docker-compose exec postgres psql -U qpuser -d qpdb -c "SELECT * FROM mars_reservation_status;"
	@echo ""
	@echo "🚀 Prime 421 is waiting for Elon!"
	@echo "Visit: http://localhost:3000/mars"