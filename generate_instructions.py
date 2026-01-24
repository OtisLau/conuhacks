#!/usr/bin/env python3
"""
Generate step-by-step instructions from screenshot + user goal.

Usage:
    python generate_instructions.py screenshot.png "Turn on Dark Mode"
    python generate_instructions.py screenshot.png "Add Chinese keyboard" --output instructions.json
"""

import os
import sys
import json
import argparse
from pathlib import Path
from PIL import Image
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()


def load_instruction_prompt() -> str:
    """Load the instruction generator prompt from file."""
    prompt_file = Path(__file__).parent / "INSTRUCTION_GENERATOR_PROMPT.md"

    if not prompt_file.exists():
        raise FileNotFoundError(f"Prompt file not found: {prompt_file}")

    return prompt_file.read_text()


def generate_instructions(screenshot_path: str, user_goal: str, api_key: str = None) -> dict:
    """
    Generate detailed step-by-step instructions for a user goal.

    Args:
        screenshot_path: Path to screenshot image
        user_goal: What the user wants to accomplish
        api_key: Google API key (or uses GOOGLE_API_KEY env var)

    Returns:
        dict: Parsed JSON instruction response
    """
    # Configure Gemini
    api_key = api_key or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY not found in environment or provided")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.0-flash-exp")

    # Load image
    img = Image.open(screenshot_path).convert("RGB")

    # Resize if too large (for faster API calls)
    max_width = 1200
    if img.width > max_width:
        new_height = int(max_width * img.height / img.width)
        img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)

    print(f"Screenshot: {img.size[0]}x{img.size[1]}")
    print(f"Goal: {user_goal}")
    print(f"Generating instructions...\n")

    # Load instruction prompt
    system_prompt = load_instruction_prompt()

    # Create full prompt
    full_prompt = f"""{system_prompt}

---

## USER TASK

**Screenshot**: [See attached image]
**User Goal**: {user_goal}

Generate the instruction JSON now. Remember:
- Return ONLY valid JSON
- No markdown fences
- Check element visibility carefully
- Include scroll/hover steps if needed
"""

    # Call Gemini
    try:
        response = model.generate_content([full_prompt, img])
        response_text = response.text.strip()

        # Clean up response (remove markdown fences if present)
        if response_text.startswith("```"):
            lines = response_text.split("\n")
            # Remove first and last lines (``` markers)
            response_text = "\n".join(lines[1:-1])
            # Remove language identifier if present
            if response_text.startswith("json"):
                response_text = "\n".join(response_text.split("\n")[1:])

        # Parse JSON
        instructions = json.loads(response_text)

        return instructions

    except json.JSONDecodeError as e:
        print(f"Failed to parse JSON response")
        print(f"Error: {e}")
        print(f"\nRaw response:\n{response_text}")
        raise

    except Exception as e:
        print(f"API Error: {e}")
        raise


def print_instructions(instructions: dict):
    """Pretty print the instructions."""
    print("=" * 70)
    print(f"TASK: {instructions['task_summary']}")
    print(f"ESTIMATED STEPS: {instructions['estimated_steps']}")
    print(f"CURRENT SCREEN: {instructions['current_screen_context']}")
    print("=" * 70)

    if instructions.get('prerequisites', {}).get('notes'):
        print(f"\nPREREQUISITES:")
        print(f"   {instructions['prerequisites']['notes']}")

    print(f"\nSTEPS:\n")

    for step in instructions['steps']:
        step_num = step['step']
        action = step['action'].upper()
        instruction = step['instruction']

        print(f"{step_num}. [{action}] {instruction}")

        # Target details
        target = step['target']
        if target.get('text'):
            print(f"   → Target: \"{target['text']}\"")
        elif target.get('description'):
            print(f"   → Target: {target['description']}")

        print(f"   → Region: {target['region']}")

        if target.get('position'):
            print(f"   → Position: {target['position']}")

        # Visibility warning
        if not target.get('is_visible', True):
            print(f"   NOTE: (Will be visible after previous steps)")

        # Type/key details
        details = step.get('details', {})
        if details.get('text_to_type'):
            print(f"   Type: \"{details['text_to_type']}\"")
        if details.get('key_to_press'):
            print(f"   Press: {details['key_to_press']}")
        if details.get('additional_notes'):
            print(f"   Note: {details['additional_notes']}")

        # Validation
        if step.get('validation'):
            print(f"   Expected: {step['validation']}")

        print()

    if instructions.get('warnings'):
        print(f"WARNINGS:")
        for warning in instructions['warnings']:
            print(f"   - {warning}")
        print()


def main():
    parser = argparse.ArgumentParser(
        description="Generate step-by-step UI instructions from screenshot + goal"
    )
    parser.add_argument("screenshot", help="Path to screenshot image")
    parser.add_argument("goal", help="User's goal/task description")
    parser.add_argument("-o", "--output", help="Output JSON file path")
    parser.add_argument("--api-key", help="Google API key (or use GOOGLE_API_KEY env var)")

    args = parser.parse_args()

    try:
        # Generate instructions
        instructions = generate_instructions(
            args.screenshot,
            args.goal,
            args.api_key
        )

        # Print to console
        print_instructions(instructions)

        # Save to file if requested
        if args.output:
            output_path = Path(args.output)
            output_path.write_text(json.dumps(instructions, indent=2))
            print(f"Saved to: {output_path}")

        return 0

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
