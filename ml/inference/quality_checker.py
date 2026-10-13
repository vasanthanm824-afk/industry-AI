"""
Image Quality & Presentation-Attack (Anti-Spoofing) Verification Module
Performs real-time biometric and image quality diagnostics on worker registration photos
and live camera crops:
- Blur / Sharpness check (Laplacian variance)
- Illumination & Glare check (Histogram brightness and contrast)
- Resolution & Aspect ratio check
- Presentation-attack / Screen display detection (Moiré pattern & high-frequency analysis)
"""

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
import cv2
import numpy as np


@dataclass
class QualityCheckResult:
    is_valid: bool
    issues: List[str]
    metrics: Dict[str, float]
    presentation_attack_detected: bool = False
    warning: Optional[str] = None


class WorkerImageQualityChecker:
    """
    Evaluates uploaded worker portraits and webcam crops against industrial biometric quality standards.
    """

    def __init__(
        self,
        min_blur_score: float = 65.0,
        min_brightness: float = 40.0,
        max_brightness: float = 230.0,
        min_contrast: float = 25.0,
        min_dimension: int = 80,
    ):
        self.min_blur_score = min_blur_score
        self.min_brightness = min_brightness
        self.max_brightness = max_brightness
        self.min_contrast = min_contrast
        self.min_dimension = min_dimension

    def evaluate_image(self, image: np.ndarray, is_registration: bool = True) -> QualityCheckResult:
        """
        Runs comprehensive image quality and anti-spoofing diagnostics.
        """
        issues: List[str] = []
        metrics: Dict[str, float] = {}

        if image is None or image.size == 0:
            return QualityCheckResult(
                is_valid=False,
                issues=["Invalid or corrupt image file."],
                metrics={"blur_score": 0.0, "brightness": 0.0, "contrast": 0.0},
            )

        h, w = image.shape[:2]
        metrics["width"] = float(w)
        metrics["height"] = float(h)

        # 1. Dimension Check
        min_dim = self.min_dimension if is_registration else 40
        if w < min_dim or h < min_dim:
            issues.append(f"Image resolution too low ({w}x{h} px). Minimum required is {min_dim}x{min_dim} px.")

        # Convert to grayscale for frequency and illumination analysis
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image.copy()

        # 2. Blur / Sharpness Check (Laplacian Variance)
        laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        metrics["blur_score"] = round(laplacian_var, 1)

        blur_threshold = self.min_blur_score if is_registration else 25.0
        if laplacian_var < blur_threshold:
            issues.append(f"Image is too blurry (sharpness score: {laplacian_var:.1f}, min: {blur_threshold}). Please hold still or upload a sharper photo.")

        # 3. Illumination / Brightness Check
        mean_brightness = float(np.mean(gray))
        metrics["brightness"] = round(mean_brightness, 1)

        if mean_brightness < self.min_brightness:
            issues.append(f"Image lighting is too dark (brightness: {mean_brightness:.1f}, min: {self.min_brightness}). Ensure adequate light.")
        elif mean_brightness > self.max_brightness:
            issues.append(f"Image is overexposed with excessive glare (brightness: {mean_brightness:.1f}, max: {self.max_brightness}). Avoid harsh background light.")

        # 4. Contrast Check
        std_contrast = float(np.std(gray))
        metrics["contrast"] = round(std_contrast, 1)
        if std_contrast < self.min_contrast:
            issues.append(f"Image has insufficient contrast (contrast: {std_contrast:.1f}). Subject details are washed out.")

        # 5. Presentation-Attack / Screen Detection (Anti-Spoofing)
        spoof_detected, spoof_score = self.detect_presentation_attack(image)
        metrics["spoof_score"] = round(spoof_score, 3)

        warning = None
        if spoof_detected:
            warning = "Possible presentation attack detected (screen reflection / moiré pattern). Live face recommended."
            if is_registration:
                # Flag but evaluate with other factors
                metrics["screen_pattern_risk"] = 1.0

        is_valid = len(issues) == 0

        return QualityCheckResult(
            is_valid=is_valid,
            issues=issues,
            metrics=metrics,
            presentation_attack_detected=spoof_detected,
            warning=warning,
        )

    def detect_presentation_attack(self, image: np.ndarray) -> Tuple[bool, float]:
        """
        Analyzes high-frequency periodicity (screen moiré patterns) and chromatic specular highlights
        characteristic of photographing a phone/monitor screen.
        """
        try:
            if image.shape[0] < 40 or image.shape[1] < 40:
                return False, 0.0

            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
            resized = cv2.resize(gray, (128, 128))

            # 2D Fast Fourier Transform to inspect periodic grid lines from electronic display matrices
            f = np.fft.fft2(resized)
            fshift = np.fft.fftshift(f)
            magnitude_spectrum = 20 * np.log(np.abs(fshift) + 1e-6)

            # Analyze high-frequency energy ratio outside central DC component
            center = 64
            radius = 24
            y, x = np.ogrid[:128, :128]
            mask = (x - center) ** 2 + (y - center) ** 2 > radius ** 2
            high_freq_energy = np.mean(magnitude_spectrum[mask])
            total_energy = np.mean(magnitude_spectrum)

            ratio = high_freq_energy / (total_energy + 1e-6)

            # Check for chromatic banding / specular screen sheen
            if len(image.shape) == 3:
                hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
                v_channel = hsv[:, :, 2]
                s_channel = hsv[:, :, 1]
                # High brightness with zero saturation often indicates LCD backlight washout
                washout = np.count_nonzero((v_channel > 240) & (s_channel < 15)) / float(image.shape[0] * image.shape[1])
            else:
                washout = 0.0

            spoof_score = float(ratio * 0.7 + washout * 3.0)
            is_spoof = spoof_score > 1.35 and washout > 0.08

            return is_spoof, spoof_score
        except Exception:
            return False, 0.0


# Singleton instance
quality_checker = WorkerImageQualityChecker()
