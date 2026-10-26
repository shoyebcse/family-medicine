package com.familymedicine.prescription;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import javax.crypto.Cipher;
import javax.crypto.spec.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/** Encryption covers original sources and extracted/reviewed health information at rest. */
@Component
public class PrescriptionCipher {
    private final byte[] key;
    public PrescriptionCipher(@Value("${PRESCRIPTION_ENCRYPTION_KEY:}") String configured,
            @Value("${app.dev-token:}") String devToken, Environment environment) {
        try {
            if (!configured.isBlank() && !configured.startsWith("REPLACE_")) {
                key=Base64.getDecoder().decode(configured);
                if(key.length!=32) throw new IllegalArgumentException();
            } else if(environment.matchesProfiles("dev","test")) {
                key=MessageDigest.getInstance("SHA-256").digest(("prescriptions:"+devToken).getBytes(StandardCharsets.UTF_8));
            } else key=null;
        } catch(Exception e) { throw new IllegalStateException("Prescription encryption requires a base64-encoded 32-byte key"); }
    }
    public byte[] encrypt(byte[] data, String context) {
        if(key==null) throw new com.familymedicine.domain.RuleViolation("STORAGE_NOT_CONFIGURED","Prescription storage is not configured",503);
        try {
            byte[] nonce=new byte[12]; new SecureRandom().nextBytes(nonce);
            var cipher=Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE,new SecretKeySpec(key,"AES"),new GCMParameterSpec(128,nonce));
            cipher.updateAAD(context.getBytes(StandardCharsets.UTF_8));
            byte[] encrypted=cipher.doFinal(data);
            return ByteBuffer.allocate(12+encrypted.length).put(nonce).put(encrypted).array();
        } catch(GeneralSecurityException e) { throw new IllegalStateException("Could not protect prescription"); }
    }
    public byte[] decrypt(byte[] data, String context) {
        try {
            var cipher=Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE,new SecretKeySpec(key,"AES"),new GCMParameterSpec(128,Arrays.copyOf(data,12)));
            cipher.updateAAD(context.getBytes(StandardCharsets.UTF_8));
            return cipher.doFinal(Arrays.copyOfRange(data,12,data.length));
        } catch(Exception e) { throw new IllegalStateException("Could not read protected prescription"); }
    }
}
