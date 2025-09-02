# OfertasB Scraper

A robust web scraper for www.ofertasb.com that extracts product information and stores it in Supabase.

## Setup

1. Create a Python virtual environment:
```bash
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Configure environment variables:
- Copy `.env.example` to `.env`
- Fill in your Supabase credentials and contact email

## Usage

Scrape all categories:
```bash
python scrape_ofertasb.py --all
```

Scrape a specific category:
```bash
python scrape_ofertasb.py --category <CATEGORY_ID>
```

## Features

- Full category and pagination traversal
- Image storage in Supabase
- Rate limiting and retry logic
- Proper price parsing
- Idempotent updates
- Detailed logging

## Database Schema

### Categories Table
- id (auto)
- external_id (unique)
- name
- source_url
- last_crawled_at

### Products Table
- id (auto)
- category_id (FK)
- external_product_id
- name
- product_url (unique)
- image_url
- image_file_url
- price_raw
- price_numeric
- currency (default: 'CRC')
- first_seen_at
- last_seen_at
- source_html_hash
