import re

def parse_price(price_str: str) -> tuple[str, float]:
    """
    Parse Costa Rican price string into raw and numeric values.
    
    Args:
        price_str: Price string like "₡12500" or "¢4000"
        
    Returns:
        Tuple of (raw_price, numeric_price)
    """
    # Store original raw price
    price_raw = price_str.strip()
    
    # Remove currency symbols and separators
    price_numeric = re.sub(r'[₡¢,\s]', '', price_raw)
    
    try:
        # Convert to float
        price_float = float(price_numeric)
        
        # If price starts with ¢ symbol, it's in colones but using ¢ symbol
        if price_raw.startswith('¢'):
            price_float = price_float
            
        return price_raw, price_float
    except ValueError:
        raise ValueError(f"Could not parse price: {price_str}")
