package com.dms.security.crypto;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import java.util.Objects;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.util.Assert;

/**
 * PasswordEncoder implementation that encrypts raw values using AES-256-GCM.
 * The stored value encodes IV + cipher text in Base64.
 */
public class AesPasswordEncoder implements PasswordEncoder {

    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_TAG_LENGTH = 128;
    private static final int IV_LENGTH = 12;

    private final SecretKey secretKey;
    private final SecureRandom secureRandom = new SecureRandom();

    public AesPasswordEncoder(String keyMaterial) {
        Assert.hasText(keyMaterial, "Encryption key must be provided");
        byte[] keyBytes = keyMaterial.getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length != 32) {
            throw new IllegalArgumentException("Encryption key must be exactly 32 bytes for AES-256");
        }
        this.secretKey = new SecretKeySpec(keyBytes, "AES");
    }

    @Override
    public String encode(CharSequence rawPassword) {
        Objects.requireNonNull(rawPassword, "rawPassword");
        try {
            byte[] iv = new byte[IV_LENGTH];
            secureRandom.nextBytes(iv);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, secretKey, new GCMParameterSpec(GCM_TAG_LENGTH, iv));
            byte[] cipherBytes = cipher.doFinal(rawPassword.toString().getBytes(StandardCharsets.UTF_8));
            ByteBuffer buffer = ByteBuffer.allocate(IV_LENGTH + cipherBytes.length);
            buffer.put(iv);
            buffer.put(cipherBytes);
            return Base64.getEncoder().encodeToString(buffer.array());
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("Failed to encrypt password", ex);
        }
    }

    @Override
    public boolean matches(CharSequence rawPassword, String encodedPassword) {
        if (rawPassword == null || encodedPassword == null) {
            return false;
        }
        try {
            return Objects.equals(rawPassword.toString(), decryptInternal(encodedPassword));
        } catch (IllegalArgumentException | GeneralSecurityException ex) {
            // Backwards compatibility: treat stored string as plain text when it
            // is not an AES payload so legacy rows can still authenticate.
            return Objects.equals(rawPassword.toString(), encodedPassword);
        }
    }

    public String decrypt(String encodedPassword) {
        if (encodedPassword == null || encodedPassword.isBlank()) {
            return "";
        }
        try {
            return decryptInternal(encodedPassword);
        } catch (IllegalArgumentException | GeneralSecurityException ex) {
            return encodedPassword;
        }
    }

    private String decryptInternal(String encodedPassword) throws GeneralSecurityException {
        byte[] combined = Base64.getDecoder().decode(encodedPassword);
        if (combined.length <= IV_LENGTH) {
            throw new IllegalArgumentException("Encoded password payload is too short");
        }
        byte[] iv = Arrays.copyOfRange(combined, 0, IV_LENGTH);
        byte[] cipherBytes = Arrays.copyOfRange(combined, IV_LENGTH, combined.length);
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.DECRYPT_MODE, secretKey, new GCMParameterSpec(GCM_TAG_LENGTH, iv));
        byte[] decrypted = cipher.doFinal(cipherBytes);
        return new String(decrypted, StandardCharsets.UTF_8);
    }
}
