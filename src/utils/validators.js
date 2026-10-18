// src/utils/validators.js
// Copy this entire file into your project at src/utils/validators.js

/**
 * ============================================================
 * MENU ITEM VALIDATORS
 * ============================================================
 */
export const MenuItemValidators = {
  validateName(name) {
    if (!name || typeof name !== 'string') return false
    const trimmed = name.trim()
    return trimmed.length >= 1 && trimmed.length <= 150
  },

  validatePrice(price) {
    const num = Number(price)
    return !isNaN(num) && num >= 0 && num <= 999999
  },

  validateCategory(category) {
    if (!category || typeof category !== 'string') return false
    const trimmed = category.trim()
    return trimmed.length >= 1 && trimmed.length <= 50
  },

  validateMenuItem(item) {
    const errors = {}

    if (!this.validateName(item.name)) {
      errors.name = 'Name must be 1-150 characters.'
    }
    if (!this.validatePrice(item.price)) {
      errors.price = 'Price must be between 0 and 999999.'
    }
    if (!this.validateCategory(item.category)) {
      errors.category = 'Category must be 1-50 characters.'
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    }
  }
}

/**
 * ============================================================
 * FILE VALIDATORS
 * ============================================================
 */
export const FileValidators = {
  MAX_IMAGE_SIZE: 5 * 1024 * 1024, // 5MB
  MAX_CSV_SIZE: 2 * 1024 * 1024, // 2MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'],
  ALLOWED_CSV_TYPES: ['text/csv', 'application/vnd.ms-excel'],

  validateImageFile(file) {
    const errors = []

    if (!file) {
      errors.push('No file selected.')
      return { isValid: false, errors }
    }

    if (file.size > this.MAX_IMAGE_SIZE) {
      errors.push(`File size must be below ${this.MAX_IMAGE_SIZE / 1024 / 1024}MB`)
    }

    if (!this.ALLOWED_IMAGE_TYPES.includes(file.type)) {
      errors.push('Only JPG, PNG, or WebP files are allowed.')
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  },

  validateCSVFile(file) {
    const errors = []

    if (!file) {
      errors.push('No file selected.')
      return { isValid: false, errors }
    }

    if (file.size > this.MAX_CSV_SIZE) {
      errors.push(`File size must be below ${this.MAX_CSV_SIZE / 1024 / 1024}MB`)
    }

    if (!this.ALLOWED_CSV_TYPES.includes(file.type)) {
      errors.push('Only CSV files are allowed.')
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }
}

/**
 * ============================================================
 * ORDER VALIDATORS
 * ============================================================
 */
export const OrderValidators = {
  validateOrderItems(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return { isValid: false, error: 'At least one item is required.' }
    }

    for (const item of items) {
      if (!item.name || !item.price || !item.qty) {
        return { isValid: false, error: 'All item details are required.' }
      }
      if (item.qty < 1 || item.qty > 999) {
        return { isValid: false, error: 'Quantity must be between 1 and 999.' }
      }
      if (item.price < 0) {
        return { isValid: false, error: 'Price cannot be negative.' }
      }
    }

    return { isValid: true }
  },

  calculateTotal(items, taxPercent = 0) {
    let subtotal = 0
    for (const item of items) {
      subtotal += item.price * item.qty
    }
    const tax = (subtotal * taxPercent) / 100
    return parseFloat((subtotal + tax).toFixed(2))
  }
}

/**
 * ============================================================
 * SECURITY VALIDATORS
 * ============================================================
 */
export const SecurityValidators = {
  validatePIN(pin) {
    if (!pin || typeof pin !== 'string') return false
    const trimmed = pin.trim()
    // PIN should be 4-6 digits
    return /^\d{4,6}$/.test(trimmed)
  },

  validateRestaurantName(name) {
    if (!name || typeof name !== 'string') return false
    const trimmed = name.trim()
    return trimmed.length >= 2 && trimmed.length <= 100
  },

  sanitizeInput(input) {
    if (typeof input !== 'string') return input
    return input
      .trim()
      .replace(/[<>\"']/g, '') // Remove potential XSS characters
      .substring(0, 500) // Limit length
  }
}

/**
 * ============================================================
 * PAYMENT VALIDATORS
 * ============================================================
 */
export const PaymentValidators = {
  validateAmount(amount) {
    const num = Number(amount)
    return !isNaN(num) && num > 0 && num <= 999999
  },

  validatePaymentMethod(method) {
    const allowed = ['card', 'upi', 'wallet', 'cod']
    return allowed.includes(method?.toLowerCase())
  }
}
