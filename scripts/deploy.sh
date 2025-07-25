#!/bin/bash

# THE QP - Unified Deployment Script
# Usage: ./scripts/deploy.sh [platform]
# Platforms: railway, fly, docker, aws

set -e

PLATFORM=${1:-railway}

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}THE QP - Deployment Script${NC}"
echo -e "${YELLOW}Platform: $PLATFORM${NC}"

# Check for required files
if [ ! -f ".env.production" ]; then
    echo -e "${RED}Error: .env.production not found${NC}"
    echo "Create it from .env.example with production values"
    exit 1
fi

case $PLATFORM in
    railway)
        echo -e "${GREEN}Deploying to Railway...${NC}"
        echo "Run these commands manually:"
        echo "1. railway login"
        echo "2. railway init"
        echo "3. railway up"
        echo "4. railway add (for PostgreSQL)"
        echo "5. railway variables set \$(cat .env.production | grep -v '^#' | xargs)"
        ;;
        
    fly)
        echo -e "${GREEN}Deploying to Fly.io...${NC}"
        if ! command -v fly &> /dev/null; then
            echo -e "${YELLOW}Installing Fly CLI...${NC}"
            curl -L https://fly.io/install.sh | sh
            export FLYCTL_INSTALL="/Users/$USER/.fly"
            export PATH="$FLYCTL_INSTALL/bin:$PATH"
        fi
        fly deploy
        fly secrets set $(cat .env.production | grep -v '^#' | xargs)
        ;;
        
    docker)
        echo -e "${GREEN}Deploying with Docker...${NC}"
        docker-compose -f docker-compose.prod.yml build
        docker-compose -f docker-compose.prod.yml up -d
        ;;
        
    aws)
        echo -e "${GREEN}Deploying to AWS...${NC}"
        cd terraform
        terraform init
        terraform plan
        terraform apply
        cd ..
        ;;
        
    *)
        echo -e "${RED}Unknown platform: $PLATFORM${NC}"
        echo "Available platforms: railway, fly, docker, aws"
        exit 1
        ;;
esac

echo -e "${GREEN}Deployment initiated for $PLATFORM${NC}"
echo -e "${YELLOW}Don't forget to:${NC}"
echo "1. Set up domain DNS"
echo "2. Configure SSL certificates"
echo "3. Run database migrations: psql \$DATABASE_URL -f scripts/schema.sql"
echo "4. Reserve prime #2 for robbie@theqp.ai"